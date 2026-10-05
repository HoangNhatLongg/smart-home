#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Start the telemetry task.
 *
 * DHT11 sampling runs in its own task so a sensor read (or a sensor that stops
 * answering) can never block the MQTT connection.
 */
esp_err_t sm_telemetry_start(void);

#ifdef __cplusplus
}
#endif