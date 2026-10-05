#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialise every node module and start the Wi-Fi station.
 *
 * After a successful MQTT connection the node publishes availability (online)
 * and its capability declaration, as required by MQTT_SPEC.md §5 and §10.
 */
esp_err_t sm_app_start(void);

#ifdef __cplusplus
}
#endif