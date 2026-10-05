#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Start the Wi-Fi station with automatic reconnection.
 *
 * MQTT is started from the IP_EVENT_STA_GOT_IP handler, so a Wi-Fi drop and
 * recover transparently re-establishes the MQTT session (and therefore the LWT
 * handled by the broker).
 */
esp_err_t sm_wifi_start(void);

#ifdef __cplusplus
}
#endif