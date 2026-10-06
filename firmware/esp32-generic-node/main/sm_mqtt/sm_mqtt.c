#include "sm_mqtt.h"

#include <stdlib.h>
#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "mqtt_client.h"
#include "sm_device.h"

static const char *TAG = "mqtt";

#define SM_MQTT_QUEUE_LEN   16
#define SM_MQTT_TASK_STACK  6144
#define SM_MQTT_TASK_PRIO   5
#define SM_MQTT_TICK_MS     20

typedef struct {
    char topic[SM_TOPIC_MAX_LEN];
    int len;
    int qos;
    bool retain;
    char payload[SM_MQTT_MAX_PAYLOAD];
} publish_item_t;

typedef struct {
    char topic[SM_TOPIC_MAX_LEN];
    int len;
    char payload[SM_MQTT_MAX_PAYLOAD];
} inbound_item_t;

static esp_mqtt_client_handle_t s_client = NULL;
static QueueHandle_t s_publish_queue = NULL;
static QueueHandle_t s_inbound_queue = NULL;
static sm_mqtt_event_cb_t s_event_cb = NULL;
static void *s_event_ctx = NULL;
static sm_mqtt_inbound_cb_t s_inbound_cb = NULL;
static void *s_inbound_ctx = NULL;
static volatile bool s_connected = false;

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)handler_args;
    (void)base;
    esp_mqtt_event_handle_t event = event_data;

    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED: {
        s_connected = true;
        ESP_LOGI(TAG, "Đã kết nối MQTT tới %s", sm_broker_uri());

        /* Subscribe to the Backend topics, MQTT_SPEC.md §2 / §3 */
        char topic_command[SM_TOPIC_MAX_LEN];
        char topic_config[SM_TOPIC_MAX_LEN];
        char topic_ota[SM_TOPIC_MAX_LEN];
        if (sm_topic_build(topic_command, sizeof(topic_command), "command") == ESP_OK &&
            sm_topic_build(topic_config, sizeof(topic_config), "config") == ESP_OK &&
            sm_topic_build(topic_ota, sizeof(topic_ota), "ota") == ESP_OK) {
            const esp_mqtt_topic_t topics[] = {
                {.filter = topic_command, .qos = SM_QOS_COMMAND},
                {.filter = topic_config, .qos = SM_QOS_CONFIG},
                {.filter = topic_ota, .qos = SM_QOS_OTA},
            };
            int msg_id = esp_mqtt_client_subscribe_multiple(s_client, topics,
                                                            sizeof(topics) / sizeof(topics[0]));
            if (msg_id < 0) {
                ESP_LOGE(TAG, "Đăng ký topic thất bại (msg_id=%d)", msg_id);
            } else {
                ESP_LOGI(TAG, "Đã đăng ký topic: %s, %s, %s", topic_command, topic_config, topic_ota);
            }
        }

        if (s_event_cb != NULL) {
            s_event_cb(SM_MQTT_EVENT_CONNECTED, s_event_ctx);
        }
        break;
    }
    case MQTT_EVENT_DISCONNECTED:
        s_connected = false;
        ESP_LOGW(TAG, "Mất kết nối MQTT, sẽ kết nối lại");
        if (s_event_cb != NULL) {
            s_event_cb(SM_MQTT_EVENT_DISCONNECTED, s_event_ctx);
        }
        break;
    case MQTT_EVENT_DATA: {
        if (event->total_data_len <= 0 || event->total_data_len >= SM_MQTT_MAX_PAYLOAD) {
            ESP_LOGE(TAG, "Tin nhắn đến trên '%s' có kích thước không được hỗ trợ (%d bytes), đã bỏ qua",
                     event->topic_len > 0 ? event->topic : "?", event->total_data_len);
            break;
        }

        /* Fragmented messages arrive in several chunks: accumulate first. */
        static inbound_item_t accumulator;
        static bool accumulating = false;

        if (!accumulating) {
            memset(&accumulator, 0, sizeof(accumulator));
            if (event->topic_len > 0 && event->topic_len < SM_TOPIC_MAX_LEN) {
                memcpy(accumulator.topic, event->topic, event->topic_len);
                accumulator.topic[event->topic_len] = '\0';
            } else {
                ESP_LOGE(TAG, "Tin nhắn đến không có topic hợp lệ, đã bỏ qua");
                break;
            }
            accumulating = true;
        }

        int offset = 0;
        if (event->current_data_offset < SM_MQTT_MAX_PAYLOAD) {
            offset = event->current_data_offset;
            if (offset + event->data_len < SM_MQTT_MAX_PAYLOAD) {
                memcpy(accumulator.payload + offset, event->data, event->data_len);
                accumulator.len = offset + event->data_len;
            }
        }

        if (accumulator.len >= event->total_data_len) {
            accumulating = false;
            accumulator.payload[accumulator.len] = '\0';

            if (xQueueSend(s_inbound_queue, &accumulator, 0) != pdTRUE) {
                ESP_LOGE(TAG, "Hàng đợi nhận đầy, tin nhắn trên '%s' bị bỏ qua", accumulator.topic);
            }
        }
        break;
    }
    case MQTT_EVENT_ERROR:
        ESP_LOGW(TAG, "Sự kiện lỗi MQTT (id=%d)", event->msg_id);
        break;
    default:
        break;
    }
}

static void publish_task(void *arg)
{
    (void)arg;
    publish_item_t item;

    while (true) {
        if (xQueueReceive(s_publish_queue, &item, pdMS_TO_TICKS(SM_MQTT_TICK_MS)) == pdTRUE) {
            if (!s_connected) {
                ESP_LOGW(TAG, "Bỏ qua phát tin trên '%s': MQTT chưa kết nối", item.topic);
                continue;
            }
            int msg_id = esp_mqtt_client_publish(s_client, item.topic, item.payload, item.len, item.qos,
                                                 item.retain ? 1 : 0);
            if (msg_id < 0) {
                ESP_LOGE(TAG, "Phát tin trên '%s' thất bại (msg_id=%d)", item.topic, msg_id);
            }
        }
    }
}

static void inbound_task(void *arg)
{
    (void)arg;
    inbound_item_t item;

    while (true) {
        if (xQueueReceive(s_inbound_queue, &item, pdMS_TO_TICKS(SM_MQTT_TICK_MS)) == pdTRUE) {
            ESP_LOGI(TAG, "Nhận %d bytes trên topic '%s'", item.len, item.topic);
            if (s_inbound_cb != NULL) {
                s_inbound_cb(item.topic, item.payload, item.len, s_inbound_ctx);
            }
        }
    }
}

esp_err_t sm_mqtt_init(void)
{
    const char *broker_uri = sm_broker_uri();
    const char *broker_user = sm_broker_username();
    const char *broker_pass = sm_broker_password();

    if (broker_uri[0] == '\0') {
        ESP_LOGE(TAG, "Chưa cấu hình broker: nhập trong trang cấu hình hoặc đặt "
                      "NODE_MQTT_BROKER_URI qua `idf.py menuconfig`");
        return ESP_ERR_INVALID_ARG;
    }

    s_publish_queue = xQueueCreate(SM_MQTT_QUEUE_LEN, sizeof(publish_item_t));
    s_inbound_queue = xQueueCreate(SM_MQTT_QUEUE_LEN, sizeof(inbound_item_t));
    if (s_publish_queue == NULL || s_inbound_queue == NULL) {
        ESP_LOGE(TAG, "Không thể tạo hàng đợi MQTT");
        return ESP_ERR_NO_MEM;
    }

    char lwt_topic[SM_TOPIC_MAX_LEN];
    esp_err_t err = sm_topic_build(lwt_topic, sizeof(lwt_topic), "availability");
    if (err != ESP_OK) {
        return err;
    }

    esp_mqtt_client_config_t mqtt_cfg = {
        .broker = {
            .address = {
                .uri = broker_uri,
            },
        },
        .credentials = {
            .username = broker_user[0] != '\0' ? broker_user : NULL,
            .client_id = sm_device_id(),
            .authentication = {
                .password = broker_pass[0] != '\0' ? broker_pass : NULL,
            },
        },
        .session = {
            .keepalive = CONFIG_NODE_MQTT_KEEPALIVE,
            .last_will = {
                .topic = lwt_topic,
                .msg = "{\"status\":\"offline\"}",
                .qos = SM_QOS_AVAILABILITY,
                .retain = 1,
            },
        },
        .network = {
            .reconnect_timeout_ms = 5000,
            .timeout_ms = 10000,
            .disable_auto_reconnect = false,
        },
        .task = {
            .priority = 5,
            .stack_size = 6144,
        },
        .buffer = {
            .size = 1536,
            .out_size = 1536,
        },
    };

    if (strncmp(broker_uri, "mqtts://", 8) == 0) {
        mqtt_cfg.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
    }

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    if (s_client == NULL) {
        ESP_LOGE(TAG, "esp_mqtt_client_init thất bại");
        return ESP_FAIL;
    }

    esp_mqtt_client_register_event(s_client, (esp_mqtt_event_id_t)ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    return ESP_OK;
}

esp_err_t sm_mqtt_start(void)
{
    if (s_client == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    if (xTaskCreate(publish_task, "mqtt_publish", SM_MQTT_TASK_STACK, NULL, SM_MQTT_TASK_PRIO, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    if (xTaskCreate(inbound_task, "mqtt_inbound", SM_MQTT_TASK_STACK, NULL, SM_MQTT_TASK_PRIO, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }

    esp_err_t err = esp_mqtt_client_start(s_client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_mqtt_client_start thất bại: %s", esp_err_to_name(err));
        return err;
    }
    ESP_LOGI(TAG, "Đã khởi động MQTT client (client_id=%s)", sm_device_id());
    return ESP_OK;
}

bool sm_mqtt_is_connected(void)
{
    return s_connected;
}

void sm_mqtt_set_event_handler(sm_mqtt_event_cb_t cb, void *ctx)
{
    s_event_cb = cb;
    s_event_ctx = ctx;
}

void sm_mqtt_set_inbound_handler(sm_mqtt_inbound_cb_t cb, void *ctx)
{
    s_inbound_cb = cb;
    s_inbound_ctx = ctx;
}

esp_err_t sm_mqtt_publish(const char *topic, const char *payload, int qos, bool retain)
{
    if (topic == NULL || payload == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (s_publish_queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    publish_item_t item = {0};
    if (strlen(topic) >= sizeof(item.topic)) {
        ESP_LOGE(TAG, "Topic quá dài: %s", topic);
        return ESP_ERR_INVALID_SIZE;
    }

    const int len = (int)strlen(payload);
    if (len >= (int)sizeof(item.payload)) {
        ESP_LOGE(TAG, "Payload quá dài (%d bytes) cho '%s'", len, topic);
        return ESP_ERR_INVALID_SIZE;
    }

    strcpy(item.topic, topic);
    memcpy(item.payload, payload, (size_t)len);
    item.payload[len] = '\0';
    item.len = len;
    item.qos = qos;
    item.retain = retain;

    if (xQueueSend(s_publish_queue, &item, pdMS_TO_TICKS(200)) != pdTRUE) {
        ESP_LOGE(TAG, "Hàng đợi phát đầy, '%s' bị bỏ qua", topic);
        return ESP_ERR_TIMEOUT;
    }
    return ESP_OK;
}