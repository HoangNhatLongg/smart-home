#pragma once
#include <stdbool.h>
#include "esp_err.h"
esp_err_t sm_motion_init(int gpio_num);
esp_err_t sm_hw_motion_read(bool *detected);
