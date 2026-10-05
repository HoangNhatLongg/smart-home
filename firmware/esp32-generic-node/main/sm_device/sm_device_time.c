#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/time.h>

#include "esp_log.h"
#include "esp_netif_sntp.h"
#include "esp_netif_types.h"
#include "sm_device.h"

static const char *TAG = "time";

static bool s_synced = false;

static void on_time_sync(struct timeval *tv)
{
    (void)tv;
    s_synced = true;
    ESP_LOGI(TAG, "Đã đồng bộ thời gian hệ thống (timestamp UTC đã dùng)");
}

esp_err_t sm_time_init(void)
{
    if (CONFIG_NODE_SNTP_SERVER[0] == '\0') {
        ESP_LOGW(TAG, "Chưa cấu hình SNTP server, timestamp tạm ở epoch cho tới khi có RTC/SNTP");
        return ESP_OK;
    }

    esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG(CONFIG_NODE_SNTP_SERVER);
    config.start = true;
    config.wait_for_sync = false; /* non-blocking: MQTT must not wait for time */
    config.sync_cb = on_time_sync;

    esp_err_t err = esp_netif_sntp_init(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_netif_sntp_init thất bại: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "Đã khởi động SNTP (server=%s)", CONFIG_NODE_SNTP_SERVER);
    return ESP_OK;
}

bool sm_time_is_synced(void)
{
    return s_synced;
}

esp_err_t sm_time_now_iso8601(char *out, size_t out_len)
{
    if (out == NULL || out_len < 21) {
        return ESP_ERR_INVALID_ARG;
    }

    time_t now = 0;
    time(&now);
    struct tm utc;
    if (gmtime_r(&now, &utc) == NULL) {
        return ESP_FAIL;
    }

    if (strftime(out, out_len, "%Y-%m-%dT%H:%M:%SZ", &utc) == 0) {
        return ESP_FAIL;
    }
    return ESP_OK;
}