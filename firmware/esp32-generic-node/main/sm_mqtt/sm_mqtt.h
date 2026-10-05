#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* QoS per topic, MQTT_SPEC.md §3 */
#define SM_QOS_TELEMETRY   0
#define SM_QOS_STATE       1
#define SM_QOS_COMMAND     1
#define SM_QOS_AVAILABILITY 1
#define SM_QOS_CONFIG      1
#define SM_QOS_CAPABILITY  1
#define SM_QOS_OTA         1

/* Retained per topic, MQTT_SPEC.md §4 */
#define SM_RETAIN_TELEMETRY   false
#define SM_RETAIN_STATE       true
#define SM_RETAIN_AVAILABILITY true
#define SM_RETAIN_CONFIG      true
#define SM_RETAIN_CAPABILITY  true
#define SM_RETAIN_OTA         false

#define SM_MQTT_MAX_PAYLOAD 1024

typedef enum {
    SM_MQTT_EVENT_CONNECTED = 0,
    SM_MQTT_EVENT_DISCONNECTED,
} sm_mqtt_event_t;

typedef void (*sm_mqtt_event_cb_t)(sm_mqtt_event_t event, void *ctx);
typedef void (*sm_mqtt_inbound_cb_t)(const char *topic, const char *payload, int payload_len, void *ctx);

esp_err_t sm_mqtt_init(void);
esp_err_t sm_mqtt_start(void);
bool sm_mqtt_is_connected(void);

void sm_mqtt_set_event_handler(sm_mqtt_event_cb_t cb, void *ctx);
void sm_mqtt_set_inbound_handler(sm_mqtt_inbound_cb_t cb, void *ctx);

/* Thread-safe, queue based. Messages are published from a dedicated task so
 * MQTT stays responsive while sensors are being sampled. */
esp_err_t sm_mqtt_publish(const char *topic, const char *payload, int qos, bool retain);

#ifdef __cplusplus
}
#endif