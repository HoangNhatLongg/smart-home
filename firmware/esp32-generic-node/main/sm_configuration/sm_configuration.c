#include "sm_configuration.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"

static const char *TAG = "config";

#define SM_TELEMETRY_INTERVAL_MIN 5
#define SM_TELEMETRY_INTERVAL_MAX 3600

static esp_err_t publish_response(long config_version, const char *status, const char *config_json,
                                  const char *error)
{
    char topic[SM_TOPIC_MAX_LEN];
    esp_err_t err = sm_topic_build(topic, sizeof(topic), "config");
    if (err != ESP_OK) {
        return err;
    }

    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return ESP_ERR_NO_MEM;
    }

    cJSON_AddNumberToObject(root, "config_version", (double)config_version);
    cJSON_AddStringToObject(root, "status", status);

    if (config_json != NULL && config_json[0] != '\0') {
        cJSON *config = cJSON_Parse(config_json);
        if (config != NULL) {
            cJSON_AddItemToObject(root, "config", config);
        } else {
            ESP_LOGE(TAG, "Không phân tích lại được cấu hình đã áp dụng để tạo response");
        }
    }

    if (error != NULL) {
        cJSON_AddStringToObject(root, "error", error);
    }

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = sm_mqtt_publish(topic, payload, SM_QOS_CONFIG, SM_RETAIN_CONFIG);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã phát response cấu hình: %s", payload);
    } else {
        ESP_LOGE(TAG, "Phát response cấu hình thất bại: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
    return err;
}

esp_err_t sm_configuration_handle(const char *payload, int payload_len)
{
    if (payload == NULL || payload_len <= 0) {
        ESP_LOGE(TAG, "Payload cấu hình rỗng");
        return ESP_ERR_INVALID_ARG;
    }

    cJSON *root = cJSON_ParseWithLength(payload, (size_t)payload_len);
    if (root == NULL || !cJSON_IsObject(root)) {
        ESP_LOGE(TAG, "Payload cấu hình không phải JSON object");
        cJSON_Delete(root);
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t result = ESP_ERR_INVALID_ARG;

    const cJSON *version_item = cJSON_GetObjectItemCaseSensitive(root, "config_version");
    if (!cJSON_IsNumber(version_item) || cJSON_GetNumberValue(version_item) < 0) {
        ESP_LOGE(TAG, "Bỏ qua cấu hình: config_version phải là số không âm");
        (void)publish_response(0, SM_CONFIG_STATUS_REJECTED, NULL, "config_version must be a non-negative number");
        goto done;
    }
    const long config_version = (long)cJSON_GetNumberValue(version_item);

    const cJSON *config = cJSON_GetObjectItemCaseSensitive(root, "config");
    if (!cJSON_IsObject(config)) {
        ESP_LOGE(TAG, "Bỏ qua cấu hình %ld: thiếu object config", config_version);
        (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, "missing config object");
        goto done;
    }

    sm_node_config_t applied;
    sm_node_config_get(&applied);
    applied.config_version = (uint32_t)config_version;

    /* telemetry_interval: validated, rejected when out of range */
    const cJSON *interval_item = cJSON_GetObjectItemCaseSensitive(config, "telemetry_interval");
    if (interval_item != NULL) {
        if (!cJSON_IsNumber(interval_item)) {
            const char *error = "telemetry_interval must be a number";
            ESP_LOGE(TAG, "Bỏ qua cấu hình %ld: %s", config_version, error);
            (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, error);
            goto done;
        }
        const int interval = cJSON_GetNumberValue(interval_item);
        if (interval < SM_TELEMETRY_INTERVAL_MIN || interval > SM_TELEMETRY_INTERVAL_MAX) {
            const char *error = "telemetry_interval out of range (5..3600)";
            ESP_LOGE(TAG, "Bỏ qua cấu hình %ld: %s (%d)", config_version, error, interval);
            (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, error);
            goto done;
        }
        applied.telemetry_interval_s = (uint32_t)interval;
    }

    /* relay_N_name: display name only. Names for relays this node does not
     * have are ignored so one desired configuration can target several nodes. */
    const cJSON *entry = NULL;
    cJSON_ArrayForEach(entry, config)
    {
        if (strcmp(entry->string, "telemetry_interval") == 0) {
            continue;
        }

        unsigned int relay_index = 0;
        if (sscanf(entry->string, "relay_%u_name", &relay_index) != 1 || relay_index == 0 ||
            relay_index > SM_MAX_RELAYS) {
            ESP_LOGW(TAG, "Cấu hình %ld: key '%s' không được hỗ trợ nên đã bỏ qua",
                     config_version, entry->string);
            continue;
        }

        if (!cJSON_IsString(entry) || entry->valuestring == NULL) {
            ESP_LOGW(TAG, "Cấu hình %ld: '%s' phải là chuỗi nên đã bỏ qua",
                     config_version, entry->string);
            continue;
        }
        if (strlen(entry->valuestring) >= SM_NAME_MAX_LEN) {
            ESP_LOGW(TAG, "Cấu hình %ld: '%s' quá dài nên đã bỏ qua", config_version, entry->string);
            continue;
        }
        if (!sm_hw_relay_exists((uint8_t)relay_index)) {
            ESP_LOGW(TAG, "Cấu hình %ld: '%s' trỏ tới relay mà node này không có, đã bỏ qua",
                     config_version, entry->string);
            continue;
        }

        strncpy(applied.relay_name[relay_index - 1], entry->valuestring, SM_NAME_MAX_LEN - 1);
        applied.relay_name[relay_index - 1][SM_NAME_MAX_LEN - 1] = '\0';
    }

    /* Persist exactly what was applied so a reboot restores the same values. */
    char *applied_json = cJSON_PrintUnformatted(config);
    if (applied_json == NULL) {
        (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, "configuration is not serialisable");
        goto done;
    }

    result = sm_node_config_save((uint32_t)config_version, applied_json, &applied);
    cJSON_free(applied_json);
    if (result != ESP_OK) {
        ESP_LOGE(TAG, "Không thể lưu cấu hình %ld vào NVS", config_version);
        (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, "cannot store configuration in NVS");
        goto done;
    }

    ESP_LOGI(TAG, "Đã áp dụng cấu hình: telemetry_interval=%u s, config_version=%ld",
             (unsigned)applied.telemetry_interval_s, config_version);

    result = publish_response(config_version, SM_CONFIG_STATUS_APPLIED, sm_node_config_raw_json(), NULL);

done:
    cJSON_Delete(root);
    return result;
}