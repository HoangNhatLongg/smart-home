#include "sm_configuration.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"

static const char *TAG = "config";

static void restart_after_hardware_change(void *arg)
{
    (void)arg;
    ESP_LOGW(TAG, "Khởi động lại để áp dụng GPIO/phần cứng mới");
    esp_restart();
}

static bool read_enabled_gpio(const cJSON *hardware, const char *name, bool *enabled, int *gpio,
                              char *error, size_t error_len)
{
    const cJSON *item = cJSON_GetObjectItemCaseSensitive(hardware, name);
    if (item == NULL) return true; /* omitted means keep the current setting */
    if (!cJSON_IsObject(item)) { snprintf(error, error_len, "%s must be an object", name); return false; }
    const cJSON *enabled_item = cJSON_GetObjectItemCaseSensitive(item, "enabled");
    if (!cJSON_IsBool(enabled_item)) { snprintf(error, error_len, "%s.enabled must be boolean", name); return false; }
    *enabled = cJSON_IsTrue(enabled_item);
    if (*enabled) {
        const cJSON *gpio_item = cJSON_GetObjectItemCaseSensitive(item, "gpio");
        if (!cJSON_IsNumber(gpio_item) || (int)cJSON_GetNumberValue(gpio_item) != cJSON_GetNumberValue(gpio_item)) { snprintf(error, error_len, "%s.gpio must be an integer", name); return false; }
        *gpio = (int)cJSON_GetNumberValue(gpio_item);
    } else *gpio = -1;
    return true;
}

static bool parse_hardware(const cJSON *config, sm_setup_t *setup, bool *changed,
                           char *error, size_t error_len)
{
    const cJSON *hardware = cJSON_GetObjectItemCaseSensitive(config, "hardware");
    *changed = false;
    if (hardware == NULL) return true;
    if (!cJSON_IsObject(hardware) || sm_setup() == NULL) { snprintf(error, error_len, "hardware must be an object"); return false; }
    *setup = *sm_setup();
    if (!read_enabled_gpio(hardware, "dht11", &setup->dht11_enabled, &setup->dht11_gpio, error, error_len) ||
        !read_enabled_gpio(hardware, "soil_moisture", &setup->soil_moisture_enabled, &setup->soil_moisture_gpio, error, error_len) ||
        !read_enabled_gpio(hardware, "motion", &setup->motion_enabled, &setup->motion_gpio, error, error_len)) return false;
    const cJSON *relays = cJSON_GetObjectItemCaseSensitive(hardware, "relays");
    if (relays != NULL) {
        if (!cJSON_IsArray(relays) || cJSON_GetArraySize(relays) > SM_MAX_RELAYS) { snprintf(error, error_len, "relays must contain at most %d items", SM_MAX_RELAYS); return false; }
        setup->relay_count = (uint8_t)cJSON_GetArraySize(relays);
        for (uint8_t i = 0; i < setup->relay_count; ++i) {
            const cJSON *relay = cJSON_GetArrayItem(relays, i);
            const cJSON *gpio = relay ? cJSON_GetObjectItemCaseSensitive(relay, "gpio") : NULL;
            const cJSON *active = relay ? cJSON_GetObjectItemCaseSensitive(relay, "active_high") : NULL;
            if (!cJSON_IsObject(relay) || !cJSON_IsNumber(gpio) || (int)cJSON_GetNumberValue(gpio) != cJSON_GetNumberValue(gpio) || !cJSON_IsBool(active)) { snprintf(error, error_len, "every relay needs gpio and active_high"); return false; }
            setup->relay_gpio[i] = (int)cJSON_GetNumberValue(gpio);
            if (i == 0) setup->relay_active_high = cJSON_IsTrue(active);
            else if (setup->relay_active_high != cJSON_IsTrue(active)) { snprintf(error, error_len, "all relays must use the same active_high setting"); return false; }
        }
        for (uint8_t i = setup->relay_count; i < SM_MAX_RELAYS; ++i) setup->relay_gpio[i] = -1;
    }
    if (sm_hw_validate_setup(setup, error, error_len) != ESP_OK) return false;

    /* The config topic is retained, so the same hardware configuration is
     * replayed after every reconnect/reboot. Restart only for an actual
     * hardware delta; otherwise a retained config would cause a reboot loop. */
    const sm_setup_t *current = sm_setup();
    *changed = current->dht11_enabled != setup->dht11_enabled ||
               current->dht11_gpio != setup->dht11_gpio ||
               current->soil_moisture_enabled != setup->soil_moisture_enabled ||
               current->soil_moisture_gpio != setup->soil_moisture_gpio ||
               current->motion_enabled != setup->motion_enabled ||
               current->motion_gpio != setup->motion_gpio ||
               current->relay_count != setup->relay_count ||
               current->relay_active_high != setup->relay_active_high;
    for (uint8_t i = 0; i < SM_MAX_RELAYS && !*changed; ++i) {
        *changed = current->relay_gpio[i] != setup->relay_gpio[i];
    }
    return true;
}

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

    /* Backend and ESP share the retained config topic. An `applied`/`rejected`
     * response is not a command and must never be processed again after a
     * reconnect, otherwise a hardware change would restart in a loop. */
    if (cJSON_GetObjectItemCaseSensitive(root, "status") != NULL) {
        cJSON_Delete(root);
        return ESP_OK;
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
    sm_setup_t next_setup = {0};
    bool hardware_changed = false;
    char hardware_error[112];
    if (!parse_hardware(config, &next_setup, &hardware_changed, hardware_error, sizeof(hardware_error))) {
        ESP_LOGW(TAG, "Bỏ qua cấu hình phần cứng: %s", hardware_error);
        (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, hardware_error);
        goto done;
    }

    /* telemetry_interval: validated, rejected when out of range */
    const cJSON *interval_item = cJSON_GetObjectItemCaseSensitive(config, "telemetry_interval");
    if (interval_item != NULL) {
        const double interval_value = cJSON_IsNumber(interval_item)
                                          ? cJSON_GetNumberValue(interval_item)
                                          : -1.0;
        if (!cJSON_IsNumber(interval_item)) {
            const char *error = "telemetry_interval must be an integer number of seconds";
            ESP_LOGE(TAG, "Bỏ qua cấu hình %ld: %s", config_version, error);
            (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, error);
            goto done;
        }
        if (interval_value < SM_TELEMETRY_INTERVAL_MIN_S || interval_value > SM_TELEMETRY_INTERVAL_MAX_S) {
            const char *error = "telemetry_interval out of range (5..3600)";
            ESP_LOGE(TAG, "Bỏ qua cấu hình %ld: %s (%.2f)", config_version, error, interval_value);
            (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, error);
            goto done;
        }
        if (interval_value != (double)(uint32_t)interval_value) {
            const char *error = "telemetry_interval must be an integer number of seconds";
            ESP_LOGE(TAG, "Bỏ qua cấu hình %ld: %s", config_version, error);
            (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, error);
            goto done;
        }
        applied.telemetry_interval_s = (uint32_t)interval_value;
    }

    /* relay_N_name: display name only. Names for relays this node does not
     * have are ignored so one desired configuration can target several nodes. */
    const cJSON *entry = NULL;
    cJSON_ArrayForEach(entry, config)
    {
        if (strcmp(entry->string, "telemetry_interval") == 0 || strcmp(entry->string, "hardware") == 0) {
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

    if (hardware_changed && sm_setup_save(&next_setup) != ESP_OK) {
        (void)publish_response(config_version, SM_CONFIG_STATUS_REJECTED, NULL, "cannot store hardware configuration in NVS");
        result = ESP_FAIL;
        goto done;
    }

    ESP_LOGI(TAG, "Đã áp dụng cấu hình: telemetry_interval=%u s, config_version=%ld",
             (unsigned)applied.telemetry_interval_s, config_version);

    result = publish_response(config_version, SM_CONFIG_STATUS_APPLIED, sm_node_config_raw_json(), NULL);
    if (result == ESP_OK && hardware_changed) {
        esp_timer_create_args_t timer_args = { .callback = restart_after_hardware_change };
        esp_timer_handle_t timer = NULL;
        if (esp_timer_create(&timer_args, &timer) == ESP_OK) (void)esp_timer_start_once(timer, 1200 * 1000);
    }

done:
    cJSON_Delete(root);
    return result;
}
