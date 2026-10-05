#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"
#include "sm_device.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Hardware abstraction for the Generic Node.
 *
 * The GPIO mapping lives in a single place (Kconfig "Generic IoT Node ->
 * Hardware Configuration" -> main/Kconfig.projbuild) and is exposed here. No
 * module is allowed to hard-code a GPIO number.
 */
typedef struct {
    bool dht11_enabled;
    int dht11_gpio;
    uint8_t relay_count;
    int relay_gpio[SM_MAX_RELAYS];
    bool relay_active_high;
} sm_hw_config_t;

const sm_hw_config_t *sm_hw_config(void);

esp_err_t sm_hw_init(void);

/* Relay driver: relay index is 1-based (relay_1 .. relay_2). */
bool sm_hw_relay_exists(uint8_t relay_index);
esp_err_t sm_hw_relay_set(uint8_t relay_index, bool on);
bool sm_hw_relay_get(uint8_t relay_index);

/* DHT11 driver. Returns ESP_ERR_INVALID_STATE when the sensor does not answer:
 * callers must not publish fabricated values in that case. */
esp_err_t sm_hw_dht11_read(float *temperature_c, float *humidity_pct);

#ifdef __cplusplus
}
#endif