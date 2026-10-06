#include "sm_capability.h"

#include <stdio.h>

#include "cJSON.h"
#include "esp_log.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_mqtt.h"

static const char *TAG = "capability";

static void add_capability(cJSON *capabilities, const char *capability_id, const char *instance_code)
{
    cJSON *entry = cJSON_CreateObject();
    if (entry == NULL) {
        return;
    }
    cJSON_AddStringToObject(entry, "capability_id", capability_id);
    cJSON_AddStringToObject(entry, "instance_code", instance_code);
    cJSON_AddItemToArray(capabilities, entry);
}

esp_err_t sm_capability_publish(void)
{
    const sm_hw_config_t *hw = sm_hw_config();

    char topic[SM_TOPIC_MAX_LEN];
    esp_err_t err = sm_topic_build(topic, sizeof(topic), "capability");
    if (err != ESP_OK) {
        return err;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON *capabilities = cJSON_CreateArray();
    if (root == NULL || capabilities == NULL) {
        cJSON_Delete(root);
        cJSON_Delete(capabilities);
        return ESP_ERR_NO_MEM;
    }

    /* Registry codes: temperature, humidity, relay (SYSTEM_SPEC.md §6) */
    if (hw->dht11_enabled) {
        add_capability(capabilities, "temperature", "temperature");
        add_capability(capabilities, "humidity", "humidity");
    }
    if (hw->soil_moisture_enabled) add_capability(capabilities, "soil_moisture", "soil_moisture");
    if (hw->motion_enabled) add_capability(capabilities, "motion", "motion");
    for (uint8_t i = 0; i < hw->relay_count && i < SM_MAX_RELAYS; i++) {
        char instance[SM_NAME_MAX_LEN];
        snprintf(instance, sizeof(instance), "relay_%u", (unsigned)(i + 1));
        add_capability(capabilities, "relay", instance);
    }

    cJSON_AddStringToObject(root, "device_id", sm_device_id());
    cJSON_AddStringToObject(root, "firmware_version", sm_firmware_version());
    cJSON_AddItemToObject(root, "capabilities", capabilities);

    char *payload = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = sm_mqtt_publish(topic, payload, SM_QOS_CAPABILITY, SM_RETAIN_CAPABILITY);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Đã phát capability: %s", payload);
    } else {
        ESP_LOGE(TAG, "Phát capability thất bại: %s", esp_err_to_name(err));
    }
    cJSON_free(payload);
    return err;
}
