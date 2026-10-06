#pragma once

#include "esp_err.h"

/* Monitors the BOOT/reset button while the app is running. */
esp_err_t sm_wifi_reset_start(void);
