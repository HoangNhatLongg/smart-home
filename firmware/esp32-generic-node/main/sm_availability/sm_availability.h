#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Publish retained availability "online" (MQTT_SPEC.md §5, §9).
 *
 * Called on every (re)connect. The offline notification is handled by the
 * MQTT Last Will configured in sm_mqtt.
 */
esp_err_t sm_availability_publish_online(void);

/**
 * @brief Start retained online heartbeats while MQTT is connected.
 *
 * A heartbeat lets a restarted Backend distinguish an active node from an old
 * retained online payload. The broker Last Will remains responsible for the
 * immediate offline state on an unexpected ESP disconnect.
 */
esp_err_t sm_availability_start(void);

#ifdef __cplusplus
}
#endif
