#include "sm_availability.h"

#include <stdio.h>

#include "cJSON.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sm_device.h"
#include "sm_mqtt.h"

static const char *TAG = "availability";
static bool s_started;

static void availability_task(void *arg)
{
    (void)arg;
    const TickType_t interval = pdMS_TO_TICKS(CONFIG_NODE_AVAILABILITY_HEARTBEAT_SECONDS * 1000U);
    for (;;) {
        if (sm_mqtt_is_connected()) {
            (void)sm_availability_publish_online();
        }
        vTaskDelay(interval);
    }
}

esp_err_t sm_availability_publish_online(void)
{
    char topic[SM_TOPIC_MAX_LEN];
    esp_err_t err = sm_topic_build(topic, sizeof(topic), "availability");
    if (err != ESP_OK) {
        return err;
    }

    char timestamp[24];
    err = sm_time_now_iso8601(timestamp, sizeof(timestamp));
    if (err != ESP_OK) {
        return err;
    }

    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return ESP_ERR_NO_MEM;
    }
    cJSON_AddStringToObject(root, "status", "online");
    cJSON_AddStringToObject(root, "timestamp", timestamp);

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = sm_mqtt_publish(topic, payload, SM_QOS_AVAILABILITY, SM_RETAIN_AVAILABILITY);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã phát availability: online (%s)", timestamp);
    } else {
        ESP_LOGE(TAG, "Phát availability thất bại: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
    return err;
}

esp_err_t sm_availability_start(void)
{
    if (s_started) {
        return ESP_OK;
    }
    if (xTaskCreate(availability_task, "availability", 3072, NULL, 4, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Không thể tạo task availability heartbeat");
        return ESP_ERR_NO_MEM;
    }
    s_started = true;
    ESP_LOGI(TAG, "Đã khởi động heartbeat availability mỗi %u giây",
             (unsigned)CONFIG_NODE_AVAILABILITY_HEARTBEAT_SECONDS);
    return ESP_OK;
}
