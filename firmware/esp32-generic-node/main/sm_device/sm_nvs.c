#include "sm_nvs.h"

#include <string.h>

#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sm_device.h"

static const char *TAG = "device";

static nvs_handle_t s_handle = 0;
static bool s_opened = false;

esp_err_t sm_nvs_open(void)
{
    if (s_opened) {
        return ESP_OK;
    }

    esp_err_t err = nvs_open(SM_NVS_NAMESPACE, NVS_READWRITE, &s_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open(%s) thất bại: %s", SM_NVS_NAMESPACE, esp_err_to_name(err));
        return err;
    }
    s_opened = true;
    return ESP_OK;
}

esp_err_t sm_nvs_read_str(const char *key, char *out, size_t out_len)
{
    esp_err_t err = sm_nvs_open();
    if (err != ESP_OK) {
        return err;
    }

    size_t len = out_len;
    err = nvs_get_str(s_handle, key, out, &len);
    if (err != ESP_OK) {
        if (err != ESP_ERR_NVS_NOT_FOUND) {
            ESP_LOGW(TAG, "nvs_get_str(%s) thất bại: %s", key, esp_err_to_name(err));
        }
        return err;
    }
    out[out_len - 1] = '\0';
    return ESP_OK;
}

esp_err_t sm_nvs_write_str(const char *key, const char *value)
{
    esp_err_t err = sm_nvs_open();
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_set_str(s_handle, key, value);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str(%s) thất bại: %s", key, esp_err_to_name(err));
        return err;
    }
    return nvs_commit(s_handle);
}

esp_err_t sm_nvs_read_u32(const char *key, uint32_t *out)
{
    esp_err_t err = sm_nvs_open();
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_get_u32(s_handle, key, out);
    if (err != ESP_OK) {
        if (err != ESP_ERR_NVS_NOT_FOUND) {
            ESP_LOGW(TAG, "nvs_get_u32(%s) thất bại: %s", key, esp_err_to_name(err));
        }
        return err;
    }
    return ESP_OK;
}

esp_err_t sm_nvs_write_u32(const char *key, uint32_t value)
{
    esp_err_t err = sm_nvs_open();
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_set_u32(s_handle, key, value);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_u32(%s) thất bại: %s", key, esp_err_to_name(err));
        return err;
    }
    return nvs_commit(s_handle);
}

esp_err_t sm_nvs_read_bitmap(const char *key, uint32_t *out)
{
    return sm_nvs_read_u32(key, out);
}

esp_err_t sm_nvs_write_bitmap(const char *key, uint32_t value)
{
    return sm_nvs_write_u32(key, value);
}