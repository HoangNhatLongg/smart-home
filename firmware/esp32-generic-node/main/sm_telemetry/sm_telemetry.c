#include "sm_telemetry.h"

#include <stdbool.h>
#include <stdint.h>

#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"

static const char *TAG = "telemetry";

#define SM_TELEMETRY_TASK_STACK 6144
#define SM_TELEMETRY_TASK_PRIO  4
#define SM_TELEMETRY_TICK_MS    250

static uint32_t safe_interval(uint32_t interval_s)
{
    if (interval_s < SM_TELEMETRY_INTERVAL_MIN_S || interval_s > SM_TELEMETRY_INTERVAL_MAX_S) {
        return CONFIG_NODE_TELEMETRY_INTERVAL >= SM_TELEMETRY_INTERVAL_MIN_S &&
                       CONFIG_NODE_TELEMETRY_INTERVAL <= SM_TELEMETRY_INTERVAL_MAX_S
                   ? CONFIG_NODE_TELEMETRY_INTERVAL
                   : SM_TELEMETRY_INTERVAL_MIN_S;
    }
    return interval_s;
}

static bool add_sensor_value(cJSON *data, const char *key, double value)
{
    return cJSON_AddNumberToObject(data, key, value) != NULL;
}

static bool sample_and_publish(void)
{
    const sm_hw_config_t *hw = sm_hw_config();
    if (hw == NULL || (!hw->dht11_enabled && !hw->soil_moisture_enabled && !hw->motion_enabled)) {
        return false;
    }

    /* Never emit an epoch timestamp: wait non-blockingly for SNTP and retry on
     * the next scheduled cycle if the clock is still not synchronized. */
    if (!sm_time_is_synced()) {
        ESP_LOGW(TAG, "Thời gian chưa đồng bộ; bỏ qua telemetry để tránh timestamp epoch");
        return false;
    }

    bool has_value = false;
    bool has_temperature_humidity = false;
    bool has_soil_moisture = false;
    bool has_motion = false;
    float temperature = 0.0f;
    float humidity = 0.0f;
    float soil_moisture = 0.0f;
    bool motion = false;

    if (hw->dht11_enabled) {
        if (sm_hw_dht11_read(&temperature, &humidity) == ESP_OK) {
            has_temperature_humidity = true;
            has_value = true;
        } else {
            ESP_LOGW(TAG, "DHT11 không có số đo hợp lệ ở chu kỳ này");
        }
    }
    if (hw->soil_moisture_enabled) {
        if (sm_hw_soil_moisture_read(&soil_moisture) == ESP_OK) {
            has_soil_moisture = true;
            has_value = true;
        } else {
            ESP_LOGW(TAG, "Cảm biến độ ẩm đất không có số đo hợp lệ");
        }
    }
    if (hw->motion_enabled) {
        if (sm_hw_motion_read(&motion) == ESP_OK) {
            has_motion = true;
            has_value = true;
        }
    }
    if (!has_value) {
        return false;
    }

    /* Timestamp is captured after all enabled sensors have been sampled. */
    char timestamp[24];
    esp_err_t err = sm_time_now_iso8601(timestamp, sizeof(timestamp));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Không tạo được timestamp sau khi lấy mẫu: %s", esp_err_to_name(err));
        return false;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON *data = cJSON_CreateObject();
    if (root == NULL || data == NULL) {
        cJSON_Delete(root);
        cJSON_Delete(data);
        ESP_LOGE(TAG, "Không đủ bộ nhớ tạo telemetry JSON");
        return false;
    }

    bool json_ok = true;
    if (has_temperature_humidity) {
        json_ok = add_sensor_value(data, "temperature", (double)temperature) &&
                  add_sensor_value(data, "humidity", (double)humidity);
    }
    if (json_ok && has_soil_moisture) {
        json_ok = add_sensor_value(data, "soil_moisture", (double)soil_moisture);
    }
    if (json_ok && has_motion) {
        json_ok = cJSON_AddBoolToObject(data, "motion", motion) != NULL;
    }
    if (!json_ok || cJSON_AddStringToObject(root, "timestamp", timestamp) == NULL) {
        cJSON_Delete(root);
        cJSON_Delete(data);
        ESP_LOGE(TAG, "Không đủ bộ nhớ tạo trường telemetry JSON");
        return false;
    }

    /* Ownership transfers to root only when AddItem succeeds. */
    if (!cJSON_AddItemToObject(root, "data", data)) {
        cJSON_Delete(root);
        cJSON_Delete(data);
        ESP_LOGE(TAG, "Không thể thêm data vào telemetry JSON");
        return false;
    }
    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        ESP_LOGE(TAG, "Không đủ bộ nhớ serialize telemetry JSON");
        return false;
    }

    char topic[SM_TOPIC_MAX_LEN];
    err = sm_topic_build(topic, sizeof(topic), "telemetry");
    if (err == ESP_OK) {
        /* sm_mqtt_publish copies the topic and payload into its queue before
         * returning, so this cJSON allocation can be freed immediately. */
        err = sm_mqtt_publish(topic, payload, SM_QOS_TELEMETRY, SM_RETAIN_TELEMETRY);
    }
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã xếp telemetry vào hàng đợi MQTT: %s", payload);
    } else {
        ESP_LOGE(TAG, "Không xếp được telemetry vào hàng đợi MQTT: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
    ESP_LOGD(TAG, "Telemetry task stack high-water mark: %u",
             (unsigned)uxTaskGetStackHighWaterMark(NULL));
    return err == ESP_OK;
}

static void telemetry_task(void *arg)
{
    (void)arg;

    sm_node_config_t cfg;
    sm_node_config_get(&cfg);
    cfg.telemetry_interval_s = safe_interval(cfg.telemetry_interval_s);

    int64_t next_sample_us = esp_timer_get_time(); /* one initial sample when ready */
    bool initial_sample_pending = true;
    bool initial_wait_logged = false;
    ESP_LOGI(TAG, "Telemetry task hoạt động, chu kỳ=%u s; chờ MQTT/time theo cơ chế không block",
             (unsigned)cfg.telemetry_interval_s);

    while (true) {
        sm_node_config_t current;
        if (sm_node_config_get(&current) == ESP_OK) {
            current.telemetry_interval_s = safe_interval(current.telemetry_interval_s);
            if (current.telemetry_interval_s != cfg.telemetry_interval_s) {
                cfg = current;
                /* Runtime changes reset the timer; first publish follows one full new interval. */
                next_sample_us = esp_timer_get_time() + (int64_t)cfg.telemetry_interval_s * 1000000LL;
                initial_sample_pending = false;
                ESP_LOGI(TAG, "Chu kỳ telemetry đổi thành %u s; chờ đủ chu kỳ mới",
                         (unsigned)cfg.telemetry_interval_s);
            }
        }

        const int64_t now_us = esp_timer_get_time();
        if (now_us >= next_sample_us) {
            if (initial_sample_pending && (!sm_mqtt_is_connected() || !sm_time_is_synced())) {
                if (!initial_wait_logged) {
                    ESP_LOGI(TAG, "Chờ MQTT kết nối và đồng bộ thời gian để gửi mẫu đầu tiên");
                    initial_wait_logged = true;
                }
                next_sample_us = now_us + 1000000LL;
            } else {
                if (sm_mqtt_is_connected()) {
                    (void)sample_and_publish();
                } else {
                    ESP_LOGW(TAG, "Bỏ qua chu kỳ telemetry: MQTT chưa kết nối");
                }
                initial_sample_pending = false;
                /* Do not burst old samples after a disconnect or sensor failure. */
                next_sample_us = esp_timer_get_time() + (int64_t)cfg.telemetry_interval_s * 1000000LL;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(SM_TELEMETRY_TICK_MS));
    }
}

esp_err_t sm_telemetry_start(void)
{
    const sm_hw_config_t *hw = sm_hw_config();
    if (hw == NULL || (!hw->dht11_enabled && !hw->soil_moisture_enabled && !hw->motion_enabled)) {
        ESP_LOGI(TAG, "Node này chưa bật cảm biến telemetry");
        return ESP_OK;
    }

    if (xTaskCreate(telemetry_task, "telemetry", SM_TELEMETRY_TASK_STACK, NULL, SM_TELEMETRY_TASK_PRIO,
                    NULL) != pdPASS) {
        ESP_LOGE(TAG, "Không thể tạo task telemetry");
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
