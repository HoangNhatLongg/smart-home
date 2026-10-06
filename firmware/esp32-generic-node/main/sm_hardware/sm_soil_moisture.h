#pragma once
#include "esp_err.h"
esp_err_t sm_soil_moisture_init(int gpio_num);
esp_err_t sm_hw_soil_moisture_read(float *percent);
