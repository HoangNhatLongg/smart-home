#include "sm_wifi_reset.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "sdkconfig.h"
#include "sm_device.h"

static const char *TAG = "wifi_reset";

static void wifi_reset_task(void *arg)
{
    (void)arg;
#if CONFIG_NODE_WIFI_RESET_BUTTON_ENABLED
    const gpio_num_t pin = (gpio_num_t)CONFIG_NODE_WIFI_RESET_BUTTON_GPIO;
    const int wifi_checks = CONFIG_NODE_WIFI_RESET_HOLD_SECONDS * 10;
    const int factory_checks = 15 * 10;
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(100));
        if (gpio_get_level(pin) != 0) {
            continue;
        }

        ESP_LOGW(TAG, "Đang giữ BOOT: nhả sau %d giây để đặt lại Wi-Fi; giữ 15 giây để xóa toàn bộ cấu hình", CONFIG_NODE_WIFI_RESET_HOLD_SECONDS);
        int held_checks = 0;
        for (; held_checks < factory_checks; ++held_checks) {
            vTaskDelay(pdMS_TO_TICKS(100));
            if (gpio_get_level(pin) != 0) {
                break;
            }
            if (held_checks + 1 == wifi_checks) {
                ESP_LOGW(TAG, "Đã đủ thời gian đặt lại Wi-Fi; nhả BOOT trước 15 giây để giữ ghép nối");
            }
        }
        if (held_checks >= factory_checks) {
            ESP_LOGW(TAG, "Giữ BOOT đủ 15 giây: xóa toàn bộ NVS và khởi động lại");
            esp_err_t err = nvs_flash_erase();
            if (err == ESP_OK) {
                vTaskDelay(pdMS_TO_TICKS(250));
                esp_restart();
            }
            ESP_LOGE(TAG, "Không thể xóa NVS: %s", esp_err_to_name(err));
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }
        if (held_checks < wifi_checks) {
            ESP_LOGI(TAG, "Đã nhả BOOT trước %d giây, hủy đặt lại", CONFIG_NODE_WIFI_RESET_HOLD_SECONDS);
            continue;
        }

        esp_err_t err = sm_device_reset_wifi_credentials();
        if (err == ESP_OK) {
            ESP_LOGW(TAG, "Đã đặt lại Wi-Fi; đang khởi động lại để mở SoftAP cấu hình");
            vTaskDelay(pdMS_TO_TICKS(250));
            esp_restart();
        }
        ESP_LOGE(TAG, "Không thể đặt lại Wi-Fi: %s", esp_err_to_name(err));
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
#endif
    vTaskDelete(NULL);
}

esp_err_t sm_wifi_reset_start(void)
{
#if CONFIG_NODE_WIFI_RESET_BUTTON_ENABLED
    const gpio_num_t pin = (gpio_num_t)CONFIG_NODE_WIFI_RESET_BUTTON_GPIO;
    const gpio_config_t config = {
        .pin_bit_mask = 1ULL << pin,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    esp_err_t err = gpio_config(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Không cấu hình được GPIO reset: %s", esp_err_to_name(err));
        return err;
    }
    ESP_LOGI(TAG, "BOOT (GPIO%d): nhả sau %d giây để đặt lại Wi-Fi; giữ 15 giây để xóa toàn bộ NVS",
             CONFIG_NODE_WIFI_RESET_BUTTON_GPIO, CONFIG_NODE_WIFI_RESET_HOLD_SECONDS);
    return xTaskCreate(wifi_reset_task, "wifi_reset", 3072, NULL, 4, NULL) == pdPASS
               ? ESP_OK
               : ESP_ERR_NO_MEM;
#else
    return ESP_OK;
#endif
}
