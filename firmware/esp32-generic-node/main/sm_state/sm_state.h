#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Publish the actuator state of this node (MQTT_SPEC.md §7).
 *
 * @param command_id Command that caused this update, or NULL for a local change
 *                   (boot report, physical change). The very same command_id is
 *                   echoed back so the Backend can confirm the command.
 *
 * The state is only ever published after the GPIO output has actually been
 * applied and read back from the hardware.
 */
esp_err_t sm_state_publish(const char *command_id);

/**
 * @brief Apply a relay state and publish the resulting state.
 */
esp_err_t sm_state_set_relay(uint8_t relay_index, bool on, const char *command_id);

#ifdef __cplusplus
}
#endif