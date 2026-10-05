#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t sm_nvs_open(void);
esp_err_t sm_nvs_read_str(const char *key, char *out, size_t out_len);
esp_err_t sm_nvs_write_str(const char *key, const char *value);
esp_err_t sm_nvs_read_u32(const char *key, uint32_t *out);
esp_err_t sm_nvs_write_u32(const char *key, uint32_t value);
esp_err_t sm_nvs_read_bitmap(const char *key, uint32_t *out);
esp_err_t sm_nvs_write_bitmap(const char *key, uint32_t value);

#ifdef __cplusplus
}
#endif