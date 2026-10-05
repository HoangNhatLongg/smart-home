#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Declare the capabilities of this node (MQTT_SPEC.md §10).
 *
 * The declared capabilities are derived from the hardware configuration, so a
 * "DHT11 + relay" node and a "DHT11 only" node use the same firmware.
 * capability_id values always come from the Capability Registry
 * (temperature / humidity / relay), never invented.
 */
esp_err_t sm_capability_publish(void);

#ifdef __cplusplus
}
#endif