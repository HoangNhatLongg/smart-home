#include "sm_wifi.h"

#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_ip_addr.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/ip_addr.h"
#include "sm_app.h"
#include "sm_bootstrap.h"
#include "sm_device.h"
#include "sm_nvs.h"
#include "sm_mqtt.h"
#include "sm_provision.h"

static const char *TAG = "wifi";

#define SM_WIFI_RETRY_BASE_MS 2000
#define SM_WIFI_RETRY_MAX_MS  60000

static sm_wifi_credentials_t s_credentials;
static bool s_mqtt_started = false;
static TaskHandle_t s_reconnect_task = NULL;

static void reconnect_task(void *arg)
{
    (void)arg;
    uint32_t delay_ms = SM_WIFI_RETRY_BASE_MS;

    while (true) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        ESP_LOGW(TAG, "Kết nối lại Wi-Fi sau %u ms", (unsigned)delay_ms);
        vTaskDelay(pdMS_TO_TICKS(delay_ms));
        esp_err_t err = esp_wifi_connect();
        if (err != ESP_OK && err != ESP_ERR_WIFI_CONN) {
            ESP_LOGW(TAG, "esp_wifi_connect thất bại: %s", esp_err_to_name(err));
        }

        /* Exponential backoff so an absent AP does not keep the radio busy. */
        delay_ms = (delay_ms * 2 < SM_WIFI_RETRY_MAX_MS) ? (delay_ms * 2) : SM_WIFI_RETRY_MAX_MS;
    }
}

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)arg;

    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "Đang kết nối tới Wi-Fi SSID '%s'", s_credentials.ssid);
        esp_wifi_connect();
        return;
    }

    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Mất kết nối Wi-Fi");
        /* esp-mqtt reconnects to the broker on its own; only the STA link is retried here. */
        if (s_reconnect_task != NULL) {
            xTaskNotify(s_reconnect_task, 0, eNoAction);
        }
        return;
    }

    if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Đã kết nối Wi-Fi, địa chỉ IP " IPSTR, IP2STR(&event->ip_info.ip));

        (void)sm_bootstrap_start();
        if (sm_device_is_paired() && !s_mqtt_started) {
            s_mqtt_started = true;
            esp_err_t err = sm_mqtt_start();
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Khởi động MQTT thất bại: %s", esp_err_to_name(err));
            }
        }
    }
}

esp_err_t sm_wifi_start(void)
{
    esp_err_t err = esp_netif_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_netif_init thất bại: %s", esp_err_to_name(err));
        return err;
    }
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    bool have_credentials = sm_device_load_wifi_credentials(&s_credentials) == ESP_OK;
    uint32_t pairing_reset = 0;
    bool open_pairing_portal = sm_nvs_read_u32(SM_NVS_KEY_PAIR_RESET, &pairing_reset) == ESP_OK && pairing_reset != 0;
    if ((!have_credentials || open_pairing_portal) && CONFIG_NODE_PROVISION_ENABLED) {
        /* No network is known, so a phone configures the node over SoftAP.
         * sm_mqtt_start() runs after the reboot that follows provisioning. */
        ESP_LOGW(TAG, "Chưa có Wi-Fi nào được lưu: chuyển sang chế độ cấu hình qua điện thoại");
        return sm_provision_start();
    }

    if (!have_credentials) {
        ESP_LOGE(TAG, "Chưa cấu hình SSID và tắt provisioning: đặt NODE_WIFI_SSID qua menuconfig");
        return ESP_ERR_INVALID_STATE;
    }

    if (xTaskCreate(reconnect_task, "wifi_retry", 3072, NULL, 3, &s_reconnect_task) != pdPASS) {
        ESP_LOGE(TAG, "Không thể tạo task kết nối lại Wi-Fi");
        return ESP_ERR_NO_MEM;
    }

    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_config));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_config = {0};
    size_t ssid_len = strnlen(s_credentials.ssid, sizeof(wifi_config.sta.ssid));
    size_t pass_len = strnlen(s_credentials.password, sizeof(wifi_config.sta.password));
    memcpy(wifi_config.sta.ssid, s_credentials.ssid, ssid_len);
    memcpy(wifi_config.sta.password, s_credentials.password, pass_len);
    wifi_config.sta.threshold.authmode = WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "Đã khởi động Wi-Fi STA (backoff kết nối lại từ %d ms đến %d ms)",
             SM_WIFI_RETRY_BASE_MS, SM_WIFI_RETRY_MAX_MS);
    return ESP_OK;
}

esp_err_t sm_wifi_start_recovery_portal(void)
{
    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "esp_netif_init cho recovery portal thất bại: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "Tạo event loop cho recovery portal thất bại: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGW(TAG, "Cấu hình phần cứng không hợp lệ; mở AP cấu hình để sửa mà giữ nguyên Wi-Fi và ghép nối");
    return sm_provision_start();
}
