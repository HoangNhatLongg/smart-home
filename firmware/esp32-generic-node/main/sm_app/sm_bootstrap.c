#include "sm_bootstrap.h"

#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sm_device.h"
#include "sm_nvs.h"

static const char *TAG = "bootstrap";
static bool s_started = false;

typedef struct { char data[1024]; size_t len; } response_t;

static esp_err_t on_http(esp_http_client_event_t *event)
{
    if (event->event_id == HTTP_EVENT_ON_DATA && event->user_data != NULL) {
        response_t *response = event->user_data;
        if (event->data_len > 0 && response->len + event->data_len < sizeof(response->data)) {
            memcpy(response->data + response->len, event->data, event->data_len);
            response->len += event->data_len;
            response->data[response->len] = '\0';
        }
    }
    return ESP_OK;
}

static int post_json(const char *base, const char *path, const char *body, response_t *response)
{
    char url[SM_URI_MAX_LEN + 64];
    if (snprintf(url, sizeof(url), "%s%s", base, path) >= (int)sizeof(url)) return -1;
    memset(response, 0, sizeof(*response));
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 10000,
        .event_handler = on_http,
        .user_data = response,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return -1;
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, strlen(body));
    esp_err_t err = esp_http_client_perform(client);
    int status = err == ESP_OK ? esp_http_client_get_status_code(client) : -1;
    esp_http_client_cleanup(client);
    return status;
}

static bool json_string(cJSON *root, const char *key, char *out, size_t size)
{
    cJSON *value = cJSON_GetObjectItemCaseSensitive(root, key);
    if (!cJSON_IsString(value) || !value->valuestring || strlen(value->valuestring) >= size) return false;
    snprintf(out, size, "%s", value->valuestring);
    return true;
}

static void bootstrap_task(void *arg)
{
    (void)arg;
    char base[SM_URI_MAX_LEN] = {0};
    char secret[65] = {0};
    char code[11] = {0};
    if (sm_nvs_read_str(SM_NVS_KEY_BACKEND, base, sizeof(base)) != ESP_OK ||
        sm_nvs_read_str(SM_NVS_KEY_DEV_SECRET, secret, sizeof(secret)) != ESP_OK ||
        sm_nvs_read_str(SM_NVS_KEY_PAIR_CODE, code, sizeof(code)) != ESP_OK) {
        ESP_LOGW(TAG, "Chưa có Backend URL hoặc mã ghép nối; cấu hình lại qua SoftAP");
        s_started = false;
        vTaskDelete(NULL);
        return;
    }

    unsigned cycle = 0;
    while (true) {
        char request[256];
        response_t response;
        if (!sm_device_is_paired() && cycle % 30 == 0) {
            snprintf(request, sizeof(request), "{\"deviceId\":\"%s\",\"deviceSecret\":\"%s\",\"pairingCode\":\"%s\"}", sm_device_id(), secret, code);
            int status = post_json(base, "/api/provisioning/register", request, &response);
            if (status != 200) ESP_LOGW(TAG, "Đăng ký ghép nối thất bại (HTTP %d)", status);
            else ESP_LOGI(TAG, "Đang chờ người dùng nhập mã ghép nối trên Dashboard");
        }
        snprintf(request, sizeof(request), "{\"deviceId\":\"%s\",\"deviceSecret\":\"%s\"}", sm_device_id(), secret);
        int status = post_json(base, "/api/provisioning/bootstrap", request, &response);
        if (status == 200) {
            cJSON *root = cJSON_Parse(response.data);
            cJSON *mqtt = root ? cJSON_GetObjectItemCaseSensitive(root, "mqtt") : NULL;
            cJSON *state = root ? cJSON_GetObjectItemCaseSensitive(root, "status") : NULL;
            if (cJSON_IsString(state) && strcmp(state->valuestring, "paired") == 0 && cJSON_IsObject(mqtt)) {
                sm_setup_t updated = *sm_setup();
                bool valid = json_string(root, "homeId", updated.home_id, sizeof(updated.home_id)) &&
                             json_string(root, "roomId", updated.room_id, sizeof(updated.room_id)) &&
                             json_string(mqtt, "uri", updated.broker_uri, sizeof(updated.broker_uri)) &&
                             json_string(mqtt, "username", updated.broker_username, sizeof(updated.broker_username)) &&
                             json_string(mqtt, "password", updated.broker_password, sizeof(updated.broker_password));
                if (valid && (strcmp(updated.home_id, sm_home_id()) != 0 ||
                              strcmp(updated.room_id, sm_room_id()) != 0 ||
                              strcmp(updated.broker_uri, sm_broker_uri()) != 0 ||
                              strcmp(updated.broker_username, sm_broker_username()) != 0 ||
                              strcmp(updated.broker_password, sm_broker_password()) != 0)) {
                    if (sm_setup_save(&updated) == ESP_OK) {
                        ESP_LOGI(TAG, "Đã nhận cấu hình nhà/phòng/MQTT, khởi động lại để áp dụng");
                        vTaskDelay(pdMS_TO_TICKS(500));
                        esp_restart();
                    }
                }
            }
            cJSON_Delete(root);
        } else if (status == 403 && sm_device_is_paired()) {
            ESP_LOGW(TAG, "Backend đã thu hồi ghép nối; giữ Wi-Fi và GPIO, mở SoftAP để ghép nối lại");
            if (sm_device_clear_pairing() == ESP_OK) {
                vTaskDelay(pdMS_TO_TICKS(500));
                esp_restart();
            }
        } else if (status != 403) {
            ESP_LOGW(TAG, "Không lấy được cấu hình bootstrap (HTTP %d)", status);
        }
        cycle++;
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}

esp_err_t sm_bootstrap_start(void)
{
    if (s_started) return ESP_OK;
    s_started = true;
    if (xTaskCreate(bootstrap_task, "bootstrap", 6144, NULL, 4, NULL) != pdPASS) {
        s_started = false;
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
