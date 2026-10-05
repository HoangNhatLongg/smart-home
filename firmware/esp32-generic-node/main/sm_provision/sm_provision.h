/* Wi-Fi provisioning portal: the node opens its own access point so a phone can
 * submit the home network credentials without reflashing. */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Starts SoftAP + HTTP portal. Call instead of the STA path when no Wi-Fi
 * credentials are stored in NVS. */
esp_err_t sm_provision_start(void);

/* Called after credentials are stored so the node reboots into STA mode. */
esp_err_t sm_provision_schedule_restart(void);

#ifdef __cplusplus
}
#endif