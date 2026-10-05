#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Protocol values of the "status" field in the config response. They must stay
 * in English because the Backend compares them (MQTT_SPEC.md §11). */
#define SM_CONFIG_STATUS_APPLIED  "applied"
#define SM_CONFIG_STATUS_REJECTED "rejected"

/**
 * @brief Handle a desired-configuration message (MQTT_SPEC.md §11).
 *
 * The message is validated, applied, persisted in NVS and the applied
 * configuration is published back on the config topic. Configuration never
 * replaces OTA.
 */
esp_err_t sm_configuration_handle(const char *payload, int payload_len);

#ifdef __cplusplus
}
#endif