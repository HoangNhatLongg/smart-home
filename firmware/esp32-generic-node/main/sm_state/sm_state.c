#include "sm_state.h"

#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"

static const char *TAG = "state";

esp_err_t sm_state_publish(const char *command_id)
{
    const sm_hw_config_t *hw = sm_hw_config();

    char topic[SM_TOPIC_MAX_LEN];
    esp_err_t err = sm_topic_build(topic, sizeof(topic), "state");
    if (err != ESP_OK) {
        return err;
    }

    char timestamp[24];
    err = sm_time_now_iso8601(timestamp, sizeof(timestamp));
    if (err != ESP_OK) {
        return err;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON *state = cJSON_CreateObject();
    if (root == NULL || state == NULL) {
        cJSON_Delete(root);
        cJSON_Delete(state);
        return ESP_ERR_NO_MEM;
    }

    for (uint8_t i = 0; i < hw->relay_count && i < SM_MAX_RELAYS; i++) {
        char instance[SM_NAME_MAX_LEN];
        snprintf(instance, sizeof(instance), "relay_%u", (unsigned)(i + 1));
        cJSON_AddBoolToObject(state, instance, sm_hw_relay_get(i + 1));
    }

    /* command_id is omitted for local state changes (MQTT_SPEC.md §7) */
    if (command_id != NULL && command_id[0] != '\0') {
        cJSON_AddStringToObject(root, "command_id", command_id);
    }
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddItemToObject(root, "state", state);

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = sm_mqtt_publish(topic, payload, SM_QOS_STATE, SM_RETAIN_STATE);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã phát state%s: %s", (command_id != NULL) ? " (theo command)" : " (thay đổi cục bộ)", payload);
    } else {
        ESP_LOGE(TAG, "Phát state thất bại: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
    return err;
}

esp_err_t sm_state_set_relay(uint8_t relay_index, bool on, const char *command_id)
{
    esp_err_t err = sm_hw_relay_set(relay_index, on);
    if (err != ESP_OK) {
        return err;
    }

    /* Confirm only after the output has been applied and read back. */
    return sm_state_publish(command_id);
}