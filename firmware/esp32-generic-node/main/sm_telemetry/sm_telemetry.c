#include "sm_telemetry.h"

#include <stdio.h>

#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"

static const char *TAG = "telemetry";

#define SM_TELEMETRY_TASK_STACK 4096
#define SM_TELEMETRY_TASK_PRIO  4
#define SM_TELEMETRY_TICK_MS    250

static void wait_for_mqtt(void)
{
    while (!sm_mqtt_is_connected()) {
        ESP_LOGI(TAG, "Đang chờ kết nối MQTT trước khi lấy mẫu");
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

static void wait_for_time(uint32_t timeout_ms)
{
    if (sm_time_is_synced() || timeout_ms == 0) {
        return;
    }

    const int64_t deadline = esp_timer_get_time() + (int64_t)timeout_ms * 1000;
    while (!sm_time_is_synced() && esp_timer_get_time() < deadline) {
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    if (!sm_time_is_synced()) {
        ESP_LOGW(TAG, "Thời gian chưa đồng bộ, timestamp tạm ở epoch");
    }
}

static void sample_and_publish(void)
{
    const sm_hw_config_t *hw = sm_hw_config();
    if (!hw->dht11_enabled) {
        return;
    }

    float temperature = 0.0f;
    float humidity = 0.0f;
    esp_err_t err = sm_hw_dht11_read(&temperature, &humidity);
    if (err != ESP_OK) {
        /* Never publish fabricated data: log the error and wait for the next
         * sampling round (task brief §9). */
        ESP_LOGE(TAG, "Đọc DHT11 thất bại: %s, bỏ qua telemetry của chu kỳ này", esp_err_to_name(err));
        return;
    }

    char topic[SM_TOPIC_MAX_LEN];
    err = sm_topic_build(topic, sizeof(topic), "telemetry");
    if (err != ESP_OK) {
        return;
    }

    char timestamp[24];
    err = sm_time_now_iso8601(timestamp, sizeof(timestamp));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Không tạo được timestamp: %s", esp_err_to_name(err));
        return;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON *data = cJSON_CreateObject();
    if (root == NULL || data == NULL) {
        cJSON_Delete(root);
        cJSON_Delete(data);
        return;
    }

    cJSON_AddNumberToObject(data, "temperature", (double)temperature);
    cJSON_AddNumberToObject(data, "humidity", (double)humidity);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddItemToObject(root, "data", data);

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        return;
    }

    err = sm_mqtt_publish(topic, payload, SM_QOS_TELEMETRY, SM_RETAIN_TELEMETRY);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã phát telemetry: %s", payload);
    } else {
        ESP_LOGE(TAG, "Phát telemetry thất bại: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
}

static void telemetry_task(void *arg)
{
    (void)arg;

    wait_for_mqtt();
    wait_for_time(CONFIG_NODE_TIME_SYNC_WAIT_MS);

    sm_node_config_t cfg;
    sm_node_config_get(&cfg);
    ESP_LOGI(TAG, "Đã khởi động task telemetry, chu kỳ=%u s", (unsigned)cfg.telemetry_interval_s);

    sample_and_publish();

    int64_t last_sample_us = esp_timer_get_time();

    while (true) {
        vTaskDelay(pdMS_TO_TICKS(SM_TELEMETRY_TICK_MS));

        if (!sm_mqtt_is_connected()) {
            continue;
        }

        sm_node_config_t current;
        sm_node_config_get(&current);
        if (current.telemetry_interval_s != cfg.telemetry_interval_s) {
            cfg = current;
            last_sample_us = esp_timer_get_time();
            ESP_LOGI(TAG, "Chu kỳ telemetry đã đổi thành %u s", (unsigned)cfg.telemetry_interval_s);
        }

        const int64_t interval_us = (int64_t)cfg.telemetry_interval_s * 1000000;
        if ((esp_timer_get_time() - last_sample_us) >= interval_us) {
            last_sample_us = esp_timer_get_time();
            sample_and_publish();
        }
    }
}

esp_err_t sm_telemetry_start(void)
{
    if (!sm_hw_config()->dht11_enabled) {
        ESP_LOGI(TAG, "Node này không có cảm biến nhiệt độ/độ ẩm, đã tắt telemetry");
        return ESP_OK;
    }

    if (xTaskCreate(telemetry_task, "telemetry", SM_TELEMETRY_TASK_STACK, NULL, SM_TELEMETRY_TASK_PRIO,
                    NULL) != pdPASS) {
        ESP_LOGE(TAG, "Không thể tạo task telemetry");
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}