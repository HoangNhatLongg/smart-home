#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "sm_device.h"

static const char *TAG = "topic";

esp_err_t sm_topic_build(char *out, size_t out_len, const char *suffix)
{
    if (out == NULL || suffix == NULL || out_len == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    int written = snprintf(out, out_len, "smarthome/%s/%s/%s/%s",
                           sm_home_id(), sm_room_id(), sm_device_id(), suffix);
    if (written < 0 || (size_t)written >= out_len) {
        ESP_LOGE(TAG, "Topic quá dài cho bộ đệm (cần %d bytes)", written);
        return ESP_ERR_INVALID_SIZE;
    }
    return ESP_OK;
}

bool sm_topic_matches_suffix(const char *topic, const char *suffix)
{
    if (topic == NULL || suffix == NULL) {
        return false;
    }

    char expected[SM_TOPIC_MAX_LEN];
    if (sm_topic_build(expected, sizeof(expected), suffix) != ESP_OK) {
        return false;
    }
    return strcmp(topic, expected) == 0;
}