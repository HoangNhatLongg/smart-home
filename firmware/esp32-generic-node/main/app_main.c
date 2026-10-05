#include <stdio.h>

#include "esp_err.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "sm_app.h"

static const char *TAG = "main";

void app_main(void)
{
    ESP_LOGI(TAG, "Đang khởi động Generic IoT Node ESP32");

    /* NVS is initialised inside sm_wifi_start() because the Wi-Fi driver
     * requires it; a failure here is reported there. */
    esp_err_t err = sm_app_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "khởi động thất bại: %s", esp_err_to_name(err));
    }
}