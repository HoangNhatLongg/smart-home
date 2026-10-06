#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "sm_device.h"
#include "sm_nvs.h"

static const char *TAG = "device";

static sm_node_config_t s_config;
static char s_config_json[SM_PAYLOAD_MAX_LEN];

static void config_defaults(sm_node_config_t *cfg)
{
    memset(cfg, 0, sizeof(*cfg));
    cfg->config_version = 0;
    cfg->telemetry_interval_s = CONFIG_NODE_TELEMETRY_INTERVAL >= SM_TELEMETRY_INTERVAL_MIN_S &&
                                        CONFIG_NODE_TELEMETRY_INTERVAL <= SM_TELEMETRY_INTERVAL_MAX_S
                                    ? CONFIG_NODE_TELEMETRY_INTERVAL
                                    : SM_TELEMETRY_INTERVAL_MIN_S;
}

esp_err_t sm_node_config_init(void)
{
    config_defaults(&s_config);
    s_config_json[0] = '\0';

    uint32_t version = 0;
    if (sm_nvs_read_u32(SM_NVS_KEY_CFG_VER, &version) == ESP_OK) {
        s_config.config_version = version;
    }

    char json[SM_PAYLOAD_MAX_LEN] = {0};
    if (sm_nvs_read_str(SM_NVS_KEY_CFG_JSON, json, sizeof(json)) == ESP_OK && json[0] != '\0') {
        strncpy(s_config_json, json, sizeof(s_config_json) - 1);
        s_config_json[sizeof(s_config_json) - 1] = '\0';

        /* Runtime values are restored from the stored JSON so a reboot restores
         * the Backend-provided configuration (MQTT_SPEC.md §11). */
        cJSON *config = cJSON_Parse(s_config_json);
        if (config != NULL) {
            cJSON *interval = cJSON_GetObjectItemCaseSensitive(config, "telemetry_interval");
            if (cJSON_IsNumber(interval)) {
                const double interval_value = cJSON_GetNumberValue(interval);
                if (interval_value >= SM_TELEMETRY_INTERVAL_MIN_S &&
                    interval_value <= SM_TELEMETRY_INTERVAL_MAX_S &&
                    interval_value == (double)(uint32_t)interval_value) {
                    s_config.telemetry_interval_s = (uint32_t)interval_value;
                } else {
                    ESP_LOGW(TAG, "telemetry_interval trong NVS không hợp lệ; dùng mặc định %u s",
                             (unsigned)s_config.telemetry_interval_s);
                }
            }
            for (int i = 0; i < SM_MAX_RELAYS; i++) {
                char key[SM_NAME_MAX_LEN];
                snprintf(key, sizeof(key), "relay_%d_name", i + 1);
                cJSON *name = cJSON_GetObjectItemCaseSensitive(config, key);
                if (cJSON_IsString(name) && name->valuestring != NULL) {
                    strncpy(s_config.relay_name[i], name->valuestring, SM_NAME_MAX_LEN - 1);
                    s_config.relay_name[i][SM_NAME_MAX_LEN - 1] = '\0';
                }
            }
            cJSON_Delete(config);
        } else {
            ESP_LOGW(TAG, "JSON cấu hình lưu trong NVS không phân tích được, dùng giá trị mặc định");
        }
    }

    ESP_LOGI(TAG, "Đã khôi phục cấu hình từ NVS (config_version=%u, telemetry_interval=%u s)",
             (unsigned)s_config.config_version, (unsigned)s_config.telemetry_interval_s);
    return ESP_OK;
}

esp_err_t sm_node_config_get(sm_node_config_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    *out = s_config;
    return ESP_OK;
}

esp_err_t sm_node_config_save(uint32_t config_version, const char *config_json, const sm_node_config_t *cfg)
{
    if (cfg == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (cfg->telemetry_interval_s < SM_TELEMETRY_INTERVAL_MIN_S ||
        cfg->telemetry_interval_s > SM_TELEMETRY_INTERVAL_MAX_S) {
        ESP_LOGE(TAG, "Từ chối lưu telemetry_interval=%u (giới hạn %u..%u s)",
                 (unsigned)cfg->telemetry_interval_s, (unsigned)SM_TELEMETRY_INTERVAL_MIN_S,
                 (unsigned)SM_TELEMETRY_INTERVAL_MAX_S);
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = sm_nvs_write_str(SM_NVS_KEY_CFG_JSON, config_json == NULL ? "" : config_json);
    if (err != ESP_OK) {
        return err;
    }
    err = sm_nvs_write_u32(SM_NVS_KEY_CFG_VER, config_version);
    if (err != ESP_OK) {
        return err;
    }

    s_config = *cfg;
    s_config.config_version = config_version;
    if (config_json != NULL) {
        strncpy(s_config_json, config_json, sizeof(s_config_json) - 1);
        s_config_json[sizeof(s_config_json) - 1] = '\0';
    }

    ESP_LOGI(TAG, "Đã lưu cấu hình vào NVS (config_version=%u, telemetry_interval=%u s)",
             (unsigned)config_version, (unsigned)s_config.telemetry_interval_s);
    return ESP_OK;
}

const char *sm_node_config_raw_json(void)
{
    return s_config_json;
}
