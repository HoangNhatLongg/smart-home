#include "sm_hardware.h"

#include <string.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "sm_dht11.h"
#include "sm_relay.h"

/* The relay GPIO symbols only exist when the relay instance is enabled in
 * Kconfig (NODE_RELAY_COUNT). Unused instances are compiled out. */
#ifdef CONFIG_NODE_RELAY_1_GPIO
#define SM_RELAY_1_GPIO CONFIG_NODE_RELAY_1_GPIO
#else
#define SM_RELAY_1_GPIO (-1)
#endif

#ifdef CONFIG_NODE_RELAY_2_GPIO
#define SM_RELAY_2_GPIO CONFIG_NODE_RELAY_2_GPIO
#else
#define SM_RELAY_2_GPIO (-1)
#endif

static const char *TAG = "hardware";

static const sm_hw_config_t s_config = {
    .dht11_enabled = CONFIG_NODE_DHT11_ENABLED,
    .dht11_gpio = CONFIG_NODE_DHT11_GPIO,
    .relay_count = CONFIG_NODE_RELAY_COUNT,
    .relay_gpio = {SM_RELAY_1_GPIO, SM_RELAY_2_GPIO},
    .relay_active_high = CONFIG_NODE_RELAY_ACTIVE_HIGH,
};

const sm_hw_config_t *sm_hw_config(void)
{
    return &s_config;
}

esp_err_t sm_hw_init(void)
{
    ESP_LOGI(TAG, "Cấu hình phần cứng: dht11=%s (gpio=%d), số relay=%u (mức kích hoạt %s)",
             s_config.dht11_enabled ? "có" : "không",
             s_config.dht11_enabled ? s_config.dht11_gpio : -1,
             (unsigned)s_config.relay_count,
             s_config.relay_active_high ? "cao" : "thấp");

    if (s_config.relay_count > SM_MAX_RELAYS) {
        ESP_LOGE(TAG, "NODE_RELAY_COUNT (%u) vượt quá giới hạn đã biên dịch (%d)",
                 (unsigned)s_config.relay_count, SM_MAX_RELAYS);
        return ESP_ERR_INVALID_ARG;
    }

    /* Two consumers on one pin would silently corrupt both the sensor reads
     * and the relay state, so this configuration error is reported early. */
    if (s_config.dht11_enabled) {
        for (int i = 0; i < s_config.relay_count; i++) {
            if (s_config.relay_gpio[i] == s_config.dht11_gpio) {
                ESP_LOGE(TAG, "GPIO%d đang được gán cho cả DHT11 và relay %d",
                         s_config.dht11_gpio, i + 1);
                return ESP_ERR_INVALID_ARG;
            }
        }
    }

    if (s_config.dht11_enabled) {
        esp_err_t err = sm_dht11_init(s_config.dht11_gpio);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Khởi tạo DHT11 trên GPIO%d thất bại: %s", s_config.dht11_gpio, esp_err_to_name(err));
            return err;
        }
    }

    return sm_relay_init();
}