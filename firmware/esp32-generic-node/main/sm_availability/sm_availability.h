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

#ifdef __cplusplus
}
#endif