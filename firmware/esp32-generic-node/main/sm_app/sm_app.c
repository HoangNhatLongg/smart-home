#include "sm_app.h"

#include "esp_flash.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "sm_availability.h"
#include "sm_capability.h"
#include "sm_command.h"
#include "sm_configuration.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"
#include "sm_ota.h"
#include "sm_state.h"
#include "sm_telemetry.h"
#include "sm_wifi.h"
#include "sm_wifi_reset.h"

static const char *TAG = "app";

static void on_mqtt_event(sm_mqtt_event_t event, void *ctx)
{
    (void)ctx;

    switch (event) {
    case SM_MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "Đã thiết lập phiên MQTT");
        /* Online availability must be visible to the Backend first, the
         * capability declaration and the current state follow on the same
         * session so the Backend knows what this node can do and how it is. */
        if (sm_availability_publish_online() == ESP_OK) {
            (void)sm_capability_publish();
            (void)sm_state_publish(NULL);
        }
        break;

    case SM_MQTT_EVENT_DISCONNECTED:
        /* The broker publishes the retained offline status from the Last Will. */
        ESP_LOGW(TAG, "Mất phiên MQTT, broker sẽ đánh dấu node offline qua LWT");
        break;

    default:
        break;
    }
}

static void on_inbound(const char *topic, const char *payload, int payload_len, void *ctx)
{
    (void)ctx;

    if (sm_topic_matches_suffix(topic, "command")) {
        (void)sm_command_handle(payload, payload_len);
    } else if (sm_topic_matches_suffix(topic, "config")) {
        (void)sm_configuration_handle(payload, payload_len);
    } else if (sm_topic_matches_suffix(topic, "ota")) {
        (void)sm_ota_handle(payload, payload_len);
    } else {
        ESP_LOGW(TAG, "Topic không mong đợi '%s', đã bỏ qua", topic);
    }
}

static esp_err_t init_nvs(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "Partition NVS cần được xoá, đang thử lại");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_flash_init thất bại: %s", esp_err_to_name(err));
    }
    return err;
}

esp_err_t sm_app_start(void)
{
    uint32_t flash_size = 0;
    ESP_LOGI(TAG, "Đang khởi động generic node, firmware %s", sm_firmware_version());
    if (esp_flash_get_physical_size(NULL, &flash_size) == ESP_OK) {
        ESP_LOGI(TAG, "Chip: %s, dung lượng flash: %u MB", CONFIG_IDF_TARGET,
                 (unsigned)(flash_size / (1024 * 1024)));
    } else {
        ESP_LOGI(TAG, "Chip: %s", CONFIG_IDF_TARGET);
    }

    esp_err_t err = init_nvs();
    if (err != ESP_OK) {
        return err;
    }

    err = sm_device_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Chưa cấu hình định danh thiết bị: %s", esp_err_to_name(err));
        return err;
    }

    /* Start the button monitor before validating saved GPIOs. Otherwise a bad
     * persisted pin would enter recovery mode before the BOOT button exists. */
    err = sm_wifi_reset_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Khởi động nút đặt lại Wi-Fi thất bại: %s", esp_err_to_name(err));
        return err;
    }

    err = sm_hw_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Khởi tạo phần cứng thất bại: %s", esp_err_to_name(err));
#if CONFIG_NODE_PROVISION_ENABLED
        if (err == ESP_ERR_INVALID_ARG) {
            err = sm_wifi_start_recovery_portal();
            if (err == ESP_OK) {
                ESP_LOGW(TAG, "Đã mở trang cấu hình khôi phục tại http://192.168.4.1; đổi các GPIO không hợp lệ rồi lưu");
                return ESP_OK;
            }
            ESP_LOGE(TAG, "Không mở được trang cấu hình khôi phục: %s", esp_err_to_name(err));
        }
#endif
        return err;
    }

    if (sm_device_is_paired()) {
        err = sm_mqtt_init();
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Khởi tạo MQTT thất bại: %s", esp_err_to_name(err));
            return err;
        }
        sm_mqtt_set_event_handler(on_mqtt_event, NULL);
        sm_mqtt_set_inbound_handler(on_inbound, NULL);
    } else {
        ESP_LOGI(TAG, "Thiết bị chưa ghép nối; MQTT sẽ khởi động sau khi Backend cấp cấu hình");
    }

    err = sm_ota_init();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Khởi tạo OTA thất bại: %s", esp_err_to_name(err));
    }

    err = sm_wifi_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Khởi động Wi-Fi thất bại: %s", esp_err_to_name(err));
        return err;
    }

    /* SNTP needs the network stack, so it is started after esp_netif_init(). */
    err = sm_time_init();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Không thể khởi động đồng bộ thời gian: %s", esp_err_to_name(err));
    }

    /* Telemetry runs in its own task: DHT11 sampling can never block MQTT. */
    err = sm_telemetry_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Khởi động telemetry thất bại: %s", esp_err_to_name(err));
    }

    err = sm_availability_start();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Khởi động availability heartbeat thất bại: %s", esp_err_to_name(err));
    }

    return ESP_OK;
}
