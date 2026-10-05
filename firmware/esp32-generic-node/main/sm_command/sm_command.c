#include "sm_command.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_state.h"

static const char *TAG = "command";

static bool json_bool_value(const cJSON *item, bool *out)
{
    if (cJSON_IsBool(item)) {
        *out = cJSON_IsTrue(item);
        return true;
    }
    if (cJSON_IsNumber(item)) {
        *out = cJSON_GetNumberValue(item) != 0;
        return true;
    }
    return false;
}

esp_err_t sm_command_handle(const char *payload, int payload_len)
{
    if (payload == NULL || payload_len <= 0) {
        ESP_LOGE(TAG, "Payload command rỗng");
        return ESP_ERR_INVALID_ARG;
    }

    cJSON *root = cJSON_ParseWithLength(payload, (size_t)payload_len);
    if (root == NULL || !cJSON_IsObject(root)) {
        ESP_LOGE(TAG, "Payload command không phải JSON object");
        cJSON_Delete(root);
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t result = ESP_ERR_INVALID_ARG;

    const cJSON *command_id_item = cJSON_GetObjectItemCaseSensitive(root, "command_id");
    if (!cJSON_IsString(command_id_item) || command_id_item->valuestring == NULL ||
        command_id_item->valuestring[0] == '\0') {
        ESP_LOGE(TAG, "Bỏ qua command: thiếu command_id");
        goto done;
    }

    const char *command_id = command_id_item->valuestring;
    if (strlen(command_id) >= SM_COMMAND_ID_MAX_LEN) {
        ESP_LOGE(TAG, "Bỏ qua command: command_id quá dài");
        goto done;
    }

    const cJSON *command_item = cJSON_GetObjectItemCaseSensitive(root, "command");
    if (!cJSON_IsString(command_item) || command_item->valuestring == NULL) {
        ESP_LOGE(TAG, "Bỏ qua command %s: thiếu loại command", command_id);
        goto done;
    }

    const char *command_type = command_item->valuestring;
    ESP_LOGI(TAG, "Nhận command: command_id=%s command=%s", command_id, command_type);

    if (strcmp(command_type, "set_relay") != 0) {
        ESP_LOGE(TAG, "Bỏ qua command %s: không hỗ trợ command '%s'", command_id, command_type);
        goto done;
    }

    const cJSON *params = cJSON_GetObjectItemCaseSensitive(root, "params");
    if (!cJSON_IsObject(params)) {
        ESP_LOGE(TAG, "Bỏ qua command %s: thiếu params", command_id);
        goto done;
    }

    const cJSON *relay_item = cJSON_GetObjectItemCaseSensitive(params, "relay");
    if (!cJSON_IsNumber(relay_item)) {
        ESP_LOGE(TAG, "Bỏ qua command %s: params.relay phải là số", command_id);
        goto done;
    }

    /* params.relay is an instance index: a non-integer or out-of-range value
     * must never be truncated onto a valid relay (MQTT_SPEC.md §8). */
    const double relay_value = cJSON_GetNumberValue(relay_item);
    if (relay_value != (double)(int)relay_value || relay_value < 1 || relay_value > SM_MAX_RELAYS) {
        ESP_LOGE(TAG, "Bỏ qua command %s: params.relay phải là số nguyên trong 1..%d (nhận %g)",
                 command_id, SM_MAX_RELAYS, relay_value);
        goto done;
    }
    const int relay_index = (int)relay_value;

    if (!sm_hw_relay_exists((uint8_t)relay_index)) {
        ESP_LOGE(TAG, "Bỏ qua command %s: relay %d không tồn tại trên %s", command_id, relay_index,
                 sm_device_id());
        goto done;
    }

    bool requested = false;
    const cJSON *state_item = cJSON_GetObjectItemCaseSensitive(params, "state");
    if (!json_bool_value(state_item, &requested)) {
        ESP_LOGE(TAG, "Bỏ qua command %s: params.state phải là boolean", command_id);
        goto done;
    }

    /* Apply the GPIO output first, then confirm with a State message that
     * carries the original command_id (MQTT_SPEC.md §8). */
    result = sm_state_set_relay((uint8_t)relay_index, requested, command_id);

done:
    cJSON_Delete(root);
    return result;
}