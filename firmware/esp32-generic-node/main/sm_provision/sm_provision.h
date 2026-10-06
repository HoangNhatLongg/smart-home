/* Wi-Fi + device setup portal: when the node has no credentials in NVS it opens
 * its own access point and serves a web form for Wi-Fi, identity, hardware and
 * broker settings. One binary then fits every node in the house. */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Starts SoftAP + HTTP portal. Call instead of the STA path when the node has
 * not been provisioned yet. */
esp_err_t sm_provision_start(void);

/* Called after settings are stored so the node reboots and applies them. */
esp_err_t sm_provision_schedule_restart(void);

#ifdef __cplusplus
}
#endif