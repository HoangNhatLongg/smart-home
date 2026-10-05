#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t sm_dht11_init(int gpio_num);
esp_err_t sm_dht11_read_once(int gpio_num, float *temperature_c, float *humidity_pct);

#ifdef __cplusplus
}
#endif