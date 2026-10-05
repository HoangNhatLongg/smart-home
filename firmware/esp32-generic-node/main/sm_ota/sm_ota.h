#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define SM_OTA_URL_MAX_LEN   512
#define SM_OTA_JOB_ID_MAX_LEN 64

#define SM_OTA_STATUS_STARTED  "started"
#define SM_OTA_STATUS_SUCCESS  "success"
#define SM_OTA_STATUS_FAILED   "failed"

/**
 * @brief Handle an OTA job request (MQTT_SPEC.md §12).
 *
 * The job runs in its own task so downloading/erasing flash never blocks
 * telemetry, commands or the MQTT keepalive. The task publishes the job status
 * on the ota topic and restarts the node once the new image is active.
 */
esp_err_t sm_ota_init(void);
esp_err_t sm_ota_handle(const char *payload, int payload_len);

#ifdef __cplusplus
}
#endif