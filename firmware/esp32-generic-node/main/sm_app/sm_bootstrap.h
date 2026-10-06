#pragma once

#include "esp_err.h"

/* Starts REST pairing/recovery polling after Wi-Fi obtains an IP address. */
esp_err_t sm_bootstrap_start(void);
