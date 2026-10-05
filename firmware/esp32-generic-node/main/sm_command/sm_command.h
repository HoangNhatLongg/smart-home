#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define SM_COMMAND_ID_MAX_LEN 64
#define SM_COMMAND_TYPE_MAX_LEN 32

/**
 * @brief Handle a `set_relay` command (MQTT_SPEC.md §8).
 *
 * Validation order: payload -> command_id -> command type -> relay instance ->
 * state value. The relay is applied first and the resulting state is published
 * with the original command_id.
 */
esp_err_t sm_command_handle(const char *payload, int payload_len);

#ifdef __cplusplus
}
#endif