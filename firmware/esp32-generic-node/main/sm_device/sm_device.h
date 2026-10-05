#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "sdkconfig.h"

#ifdef __cplusplus
extern "C" {
#endif

#define SM_ID_MAX_LEN       32
#define SM_NAME_MAX_LEN     64
#define SM_MAX_RELAYS       2
#define SM_TOPIC_MAX_LEN    160
#define SM_PAYLOAD_MAX_LEN  1024

/* 802.11 allows 32 octets for the SSID (33 bytes with the terminator) and 64
 * octets for a WPA passphrase (65 bytes with the terminator). */
#define SM_WIFI_SSID_MAX_LEN 33
#define SM_WIFI_PASS_MAX_LEN 65

#define SM_FIRMWARE_VERSION CONFIG_NODE_FIRMWARE_VERSION

#define SM_NVS_NAMESPACE "node"
#define SM_NVS_KEY_DEVICE_ID  "device_id"
#define SM_NVS_KEY_HOME_ID    "home_id"
#define SM_NVS_KEY_ROOM_ID    "room_id"
#define SM_NVS_KEY_CFG_VER    "cfg_version"
#define SM_NVS_KEY_CFG_JSON   "cfg_json"
#define SM_NVS_KEY_RELAY_ST   "relay_state"
#define SM_NVS_KEY_WIFI_SSID  "wifi_ssid"
#define SM_NVS_KEY_WIFI_PASS  "wifi_pass"

typedef struct {
    uint32_t config_version;
    uint32_t telemetry_interval_s;
    char relay_name[SM_MAX_RELAYS][SM_NAME_MAX_LEN];
} sm_node_config_t;

/* Wi-Fi credentials come from the phone provisioning portal first and from
 * Kconfig as a fallback for development boards. */
typedef struct {
    char ssid[SM_WIFI_SSID_MAX_LEN];
    char password[SM_WIFI_PASS_MAX_LEN];
} sm_wifi_credentials_t;

/* Identity: resolved once at boot from NVS, falling back to Kconfig defaults. */
esp_err_t sm_device_init(void);
const char *sm_device_id(void);
const char *sm_home_id(void);
const char *sm_room_id(void);
const char *sm_firmware_version(void);

/* Topics: smarthome/{home_id}/{room_id}/{device_id}/{suffix} (MQTT_SPEC.md §2) */
esp_err_t sm_topic_build(char *out, size_t out_len, const char *suffix);
bool sm_topic_matches_suffix(const char *topic, const char *suffix);

/* Time: UTC ISO-8601 timestamps as used by MQTT_SPEC.md */
esp_err_t sm_time_init(void);
bool sm_time_is_synced(void);
esp_err_t sm_time_now_iso8601(char *out, size_t out_len);

/* Applied configuration (NVS backed, restored after reboot) */
esp_err_t sm_node_config_init(void);
esp_err_t sm_node_config_get(sm_node_config_t *out);
esp_err_t sm_node_config_save(uint32_t config_version, const char *config_json, const sm_node_config_t *cfg);
const char *sm_node_config_raw_json(void);

/* Relay state persistence (used by the state module) */
esp_err_t sm_device_save_relay_state(uint8_t relay_index, bool on);
esp_err_t sm_device_load_relay_state(uint8_t relay_index, bool *out);

/* Wi-Fi credentials (used by sm_app for STA and sm_provision for the portal) */
esp_err_t sm_device_load_wifi_credentials(sm_wifi_credentials_t *out);
esp_err_t sm_device_save_wifi_credentials(const char *ssid, const char *password);

#ifdef __cplusplus
}
#endif