#include "sm_ota.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mbedtls/sha256.h"
#include "sm_device.h"
#include "sm_mqtt.h"

static const char *TAG = "ota";

#define SM_OTA_TASK_STACK   8192
#define SM_OTA_TASK_PRIO    4
#define SM_OTA_HASH_CHUNK   4096
#define SM_OTA_PROGRESS_STEP (64 * 1024)

static bool s_running = false;
static size_t s_downloaded = 0;

/* A boolean Kconfig symbol that is switched off is not emitted at all, so it
 * has to be probed with #ifdef. */
static bool ota_http_allowed(void)
{
#ifdef CONFIG_NODE_OTA_ALLOW_HTTP
    return true;
#else
    return false;
#endif
}

typedef struct {
    char job_id[SM_OTA_JOB_ID_MAX_LEN];
    char version[32];
    char url[SM_OTA_URL_MAX_LEN];
    char checksum[80];
} ota_job_t;

static esp_err_t publish_status(const ota_job_t *job, const char *status, const char *error)
{
    char topic[SM_TOPIC_MAX_LEN];
    esp_err_t err = sm_topic_build(topic, sizeof(topic), "ota");
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

    cJSON_AddStringToObject(root, "job_id", job->job_id);
    cJSON_AddStringToObject(root, "status", status);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    if (error != NULL) {
        cJSON_AddStringToObject(root, "error", error);
    }

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = sm_mqtt_publish(topic, payload, SM_QOS_OTA, SM_RETAIN_OTA);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã phát trạng thái OTA: %s", payload);
    } else {
        ESP_LOGE(TAG, "Phát trạng thái OTA thất bại: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
    return err;
}

/**
 * @brief SHA-256 of a whole partition.
 *
 * The image is already in flash at this point (esp_https_ota wrote it), so the
 * partition is streamed in small chunks instead of buffering ~1.5 MB in RAM.
 */
static esp_err_t verify_sha256(const esp_partition_t *partition, const char *expected_hex)
{
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);

    uint8_t *buffer = malloc(SM_OTA_HASH_CHUNK);
    if (buffer == NULL) {
        return ESP_ERR_NO_MEM;
    }

    esp_err_t result = ESP_OK;
    for (size_t offset = 0; offset < partition->size; offset += SM_OTA_HASH_CHUNK) {
        const size_t chunk = ((partition->size - offset) < SM_OTA_HASH_CHUNK)
                                 ? (partition->size - offset)
                                 : SM_OTA_HASH_CHUNK;
        result = esp_partition_read(partition, offset, buffer, chunk);
        if (result != ESP_OK) {
            break;
        }
        mbedtls_sha256_update(&ctx, buffer, chunk);
    }

    if (result == ESP_OK) {
        uint8_t digest[32];
        mbedtls_sha256_finish(&ctx, digest);

        char hex[sizeof(digest) * 2 + 1];
        for (size_t i = 0; i < sizeof(digest); i++) {
            snprintf(hex + (i * 2), 3, "%02x", digest[i]);
        }

        if (strcasecmp(hex, expected_hex) != 0) {
            ESP_LOGE(TAG, "Checksum không khớp: đã tính được %s", hex);
            result = ESP_ERR_INVALID_CRC;
        } else {
            ESP_LOGI(TAG, "Checksum hợp lệ: %s", hex);
        }
    }

    free(buffer);
    mbedtls_sha256_free(&ctx);
    return result;
}

static esp_err_t http_event_handler(esp_http_client_event_t *event)
{
    if (event->event_id == HTTP_EVENT_ON_DATA) {
        s_downloaded += event->data_len;
        if ((s_downloaded % SM_OTA_PROGRESS_STEP) < event->data_len) {
            ESP_LOGI(TAG, "Đã tải %u bytes", (unsigned)s_downloaded);
        }
    }
    return ESP_OK;
}

static void ota_task(void *arg)
{
    /* The job struct belongs to this task and is released here: sm_ota_handle()
     * hands over the ownership once xTaskCreate() succeeded. */
    ota_job_t *job = (ota_job_t *)arg;
    const esp_partition_t *running = esp_ota_get_running_partition();
    const esp_partition_t *target = esp_ota_get_next_update_partition(NULL);

    ESP_LOGI(TAG, "Job OTA %s bắt đầu: version=%s url=%s", job->job_id, job->version, job->url);
    (void)publish_status(job, SM_OTA_STATUS_STARTED, NULL);

    esp_http_client_config_t http_config = {
        .url = job->url,
        .timeout_ms = 20000,
        .event_handler = http_event_handler,
        .keep_alive_enable = true,
    };
    if (strncmp(job->url, "https://", 8) == 0) {
        http_config.crt_bundle_attach = esp_crt_bundle_attach;
    }

    esp_https_ota_config_t ota_config = {
        .http_config = &http_config,
    };

    esp_https_ota_handle_t handle = NULL;
    esp_err_t err = esp_https_ota_begin(&ota_config, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Job OTA %s: esp_https_ota_begin thất bại: %s", job->job_id, esp_err_to_name(err));
        (void)publish_status(job, SM_OTA_STATUS_FAILED, esp_err_to_name(err));
        goto finished;
    }

    s_downloaded = 0;
    err = esp_https_ota_perform(handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Job OTA %s: tải ảnh thất bại: %s", job->job_id, esp_err_to_name(err));
        (void)esp_https_ota_abort(handle);
        (void)publish_status(job, SM_OTA_STATUS_FAILED, esp_err_to_name(err));
        goto finished;
    }

    if (!esp_https_ota_is_complete_data_received(handle)) {
        ESP_LOGE(TAG, "Job OTA %s: nhận được ảnh không đầy đủ (%u bytes)", job->job_id, (unsigned)s_downloaded);
        (void)esp_https_ota_abort(handle);
        (void)publish_status(job, SM_OTA_STATUS_FAILED, "incomplete image received");
        goto finished;
    }

    esp_app_desc_t new_app_info;
    if (esp_https_ota_get_img_desc(handle, &new_app_info) == ESP_OK) {
        if (strcmp(new_app_info.version, job->version) != 0) {
            ESP_LOGW(TAG, "Job OTA %s: version ảnh '%s' khác version được yêu cầu '%s'",
                     job->job_id, new_app_info.version, job->version);
        }
        ESP_LOGI(TAG, "Job OTA %s: version ảnh %s, đã tải %u bytes",
                 job->job_id, new_app_info.version, (unsigned)s_downloaded);
    }

    err = esp_https_ota_finish(handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Job OTA %s: esp_https_ota_finish thất bại: %s", job->job_id, esp_err_to_name(err));
        (void)publish_status(job, SM_OTA_STATUS_FAILED, esp_err_to_name(err));
        goto finished;
    }

    if (job->checksum[0] != '\0') {
        if (target == NULL) {
            (void)publish_status(job, SM_OTA_STATUS_FAILED, "no OTA partition available");
            goto finished;
        }

        err = verify_sha256(target, job->checksum);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Job OTA %s: kiểm tra checksum thất bại, giữ nguyên firmware hiện tại", job->job_id);
            if (running != NULL) {
                (void)esp_ota_set_boot_partition(running);
            }
            (void)publish_status(job, SM_OTA_STATUS_FAILED, "checksum verification failed");
            goto finished;
        }
    } else {
        ESP_LOGW(TAG, "Job OTA %s: không có checksum, chỉ kiểm tra định dạng ảnh ESP", job->job_id);
    }

    ESP_LOGI(TAG, "Job OTA %s hoàn tất, đang khởi động lại vào firmware mới", job->job_id);
    (void)publish_status(job, SM_OTA_STATUS_SUCCESS, NULL);

    /* Give the MQTT publisher time to flush the success status. */
    vTaskDelay(pdMS_TO_TICKS(2000));
    esp_restart();

finished:
    free(job);
    s_running = false;
    vTaskDelete(NULL);
}

esp_err_t sm_ota_init(void)
{
    ESP_LOGI(TAG, "Module OTA sẵn sàng (HTTP thường %s)",
             ota_http_allowed() ? "cho phép" : "từ chối");
    return ESP_OK;
}

esp_err_t sm_ota_handle(const char *payload, int payload_len)
{
    if (payload == NULL || payload_len <= 0) {
        ESP_LOGE(TAG, "Payload OTA rỗng");
        return ESP_ERR_INVALID_ARG;
    }
    if (s_running) {
        ESP_LOGW(TAG, "Một job OTA đang chạy, yêu cầu mới bị từ chối");
        return ESP_ERR_INVALID_STATE;
    }

    cJSON *root = cJSON_ParseWithLength(payload, (size_t)payload_len);
    if (root == NULL || !cJSON_IsObject(root)) {
        ESP_LOGE(TAG, "Payload OTA không phải JSON object");
        cJSON_Delete(root);
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t result = ESP_ERR_INVALID_ARG;
    ota_job_t *job = calloc(1, sizeof(ota_job_t));
    if (job == NULL) {
        cJSON_Delete(root);
        return ESP_ERR_NO_MEM;
    }

    const cJSON *item = cJSON_GetObjectItemCaseSensitive(root, "job_id");
    if (!cJSON_IsString(item) || item->valuestring == NULL || item->valuestring[0] == '\0' ||
        strlen(item->valuestring) >= sizeof(job->job_id)) {
        ESP_LOGE(TAG, "Bỏ qua OTA: job_id thiếu hoặc không hợp lệ");
        goto done;
    }
    strcpy(job->job_id, item->valuestring);

    item = cJSON_GetObjectItemCaseSensitive(root, "firmware_version");
    if (!cJSON_IsString(item) || item->valuestring == NULL || item->valuestring[0] == '\0' ||
        strlen(item->valuestring) >= sizeof(job->version)) {
        ESP_LOGE(TAG, "Bỏ qua job OTA %s: firmware_version thiếu hoặc không hợp lệ", job->job_id);
        goto done;
    }
    strcpy(job->version, item->valuestring);

    item = cJSON_GetObjectItemCaseSensitive(root, "firmware_url");
    if (!cJSON_IsString(item) || item->valuestring == NULL || item->valuestring[0] == '\0' ||
        strlen(item->valuestring) >= sizeof(job->url)) {
        ESP_LOGE(TAG, "Bỏ qua job OTA %s: firmware_url thiếu hoặc không hợp lệ", job->job_id);
        goto done;
    }
    strcpy(job->url, item->valuestring);

    const bool is_https = strncmp(job->url, "https://", 8) == 0;
    const bool is_http = strncmp(job->url, "http://", 7) == 0;
    if (!is_https && !(is_http && ota_http_allowed())) {
        ESP_LOGE(TAG, "Bỏ qua job OTA %s: firmware_url phải là URL https", job->job_id);
        goto done;
    }

    item = cJSON_GetObjectItemCaseSensitive(root, "checksum");
    if (item != NULL && !cJSON_IsNull(item)) {
        if (!cJSON_IsString(item) || item->valuestring == NULL ||
            strlen(item->valuestring) >= sizeof(job->checksum)) {
            ESP_LOGE(TAG, "Bỏ qua job OTA %s: checksum phải là chuỗi", job->job_id);
            goto done;
        }
        strcpy(job->checksum, item->valuestring);
    }

    s_running = true;
    if (xTaskCreate(ota_task, "ota", SM_OTA_TASK_STACK, job, SM_OTA_TASK_PRIO, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Job OTA %s: không thể tạo task OTA", job->job_id);
        s_running = false;
        result = ESP_ERR_NO_MEM;
        goto done;
    }
    result = ESP_OK;

done:
    /* On success the OTA task owns the job and frees it; only the rejected
     * paths release it here. */
    if (result != ESP_OK) {
        if (job->job_id[0] != '\0') {
            (void)publish_status(job, SM_OTA_STATUS_FAILED, "invalid OTA job description");
        }
        free(job);
    }
    cJSON_Delete(root);
    return result;
}