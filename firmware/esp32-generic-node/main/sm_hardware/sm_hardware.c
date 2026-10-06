#include "sm_hardware.h"

#include <string.h>
#include <stdio.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "sm_dht11.h"
#include "sm_motion.h"
#include "sm_relay.h"
#include "sm_soil_moisture.h"

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
#ifdef CONFIG_NODE_RELAY_3_GPIO
#define SM_RELAY_3_GPIO CONFIG_NODE_RELAY_3_GPIO
#else
#define SM_RELAY_3_GPIO (-1)
#endif
#ifdef CONFIG_NODE_RELAY_4_GPIO
#define SM_RELAY_4_GPIO CONFIG_NODE_RELAY_4_GPIO
#else
#define SM_RELAY_4_GPIO (-1)
#endif
#ifdef CONFIG_NODE_RELAY_5_GPIO
#define SM_RELAY_5_GPIO CONFIG_NODE_RELAY_5_GPIO
#else
#define SM_RELAY_5_GPIO (-1)
#endif
#ifdef CONFIG_NODE_RELAY_6_GPIO
#define SM_RELAY_6_GPIO CONFIG_NODE_RELAY_6_GPIO
#else
#define SM_RELAY_6_GPIO (-1)
#endif
#ifdef CONFIG_NODE_RELAY_7_GPIO
#define SM_RELAY_7_GPIO CONFIG_NODE_RELAY_7_GPIO
#else
#define SM_RELAY_7_GPIO (-1)
#endif
#ifdef CONFIG_NODE_RELAY_8_GPIO
#define SM_RELAY_8_GPIO CONFIG_NODE_RELAY_8_GPIO
#else
#define SM_RELAY_8_GPIO (-1)
#endif

static const char *TAG = "hardware";

/* The GPIO mapping is resolved at boot from the setup blob (written by the phone
 * provisioning page), falling back to Kconfig for an unprovisioned board. Both
 * hardware and provisioning go through sm_setup_t, so there is one definition
 * of a pin assignment rather than two that can drift apart. */
static sm_hw_config_t s_config;

const sm_hw_config_t *sm_hw_config(void)
{
    return &s_config;
}

static void load_config_from_setup(void)
{
    const sm_setup_t *setup = sm_setup();
    static const int kconfig_relays[SM_MAX_RELAYS] = {
        SM_RELAY_1_GPIO, SM_RELAY_2_GPIO, SM_RELAY_3_GPIO, SM_RELAY_4_GPIO,
        SM_RELAY_5_GPIO, SM_RELAY_6_GPIO, SM_RELAY_7_GPIO, SM_RELAY_8_GPIO,
    };

    if (setup == NULL) {
        s_config.dht11_enabled = CONFIG_NODE_DHT11_ENABLED;
        s_config.dht11_gpio = CONFIG_NODE_DHT11_GPIO;
        s_config.relay_count = CONFIG_NODE_RELAY_COUNT;
        memcpy(s_config.relay_gpio, kconfig_relays, sizeof(kconfig_relays));
        s_config.relay_active_high = CONFIG_NODE_RELAY_ACTIVE_HIGH;
        return;
    }

    s_config.dht11_enabled = setup->dht11_enabled;
    s_config.dht11_gpio = setup->dht11_enabled ? setup->dht11_gpio : -1;
    s_config.soil_moisture_enabled = setup->soil_moisture_enabled;
    s_config.soil_moisture_gpio = setup->soil_moisture_enabled ? setup->soil_moisture_gpio : -1;
    s_config.motion_enabled = setup->motion_enabled;
    s_config.motion_gpio = setup->motion_enabled ? setup->motion_gpio : -1;
    s_config.relay_count = setup->relay_count > SM_MAX_RELAYS ? SM_MAX_RELAYS : setup->relay_count;
    for (int i = 0; i < SM_MAX_RELAYS; i++) {
        s_config.relay_gpio[i] = setup->relay_gpio[i];
    }
    s_config.relay_active_high = setup->relay_active_high;
}

static bool reserved_gpio(int gpio)
{
    /* Safe digital I/O profile for generic ESP32-C3 boards. Keep BOOT/strap,
     * native USB, flash and UART pins out of the automatic configurator. */
    static const int supported[] = {0, 1, 3, 4, 5, 6, 7, 10, 11};
    for (size_t i = 0; i < sizeof(supported) / sizeof(supported[0]); ++i) {
        if (gpio == supported[i]) return false;
    }
    return true;
}

static esp_err_t add_pin(bool used[SM_GPIO_MAX + 1], int gpio, const char *label,
                         char *error, size_t error_len)
{
    if (gpio < SM_GPIO_MIN || gpio > SM_GPIO_MAX || reserved_gpio(gpio)) {
        snprintf(error, error_len, "%s uses unavailable GPIO%d", label, gpio);
        return ESP_ERR_INVALID_ARG;
    }
    if (used[gpio]) {
        snprintf(error, error_len, "GPIO%d is assigned more than once", gpio);
        return ESP_ERR_INVALID_ARG;
    }
    used[gpio] = true;
    return ESP_OK;
}

esp_err_t sm_hw_validate_setup(const sm_setup_t *setup, char *error, size_t error_len)
{
    if (setup == NULL || error == NULL || error_len == 0 || setup->relay_count > SM_MAX_RELAYS) {
        return ESP_ERR_INVALID_ARG;
    }
    bool used[SM_GPIO_MAX + 1] = {0};
    error[0] = '\0';
    if (setup->dht11_enabled && add_pin(used, setup->dht11_gpio, "dht11", error, error_len) != ESP_OK) return ESP_ERR_INVALID_ARG;
    if (setup->soil_moisture_enabled) {
        if (setup->soil_moisture_gpio < 0 || setup->soil_moisture_gpio > 4) {
            snprintf(error, error_len, "soil_moisture needs ADC GPIO0..GPIO4");
            return ESP_ERR_INVALID_ARG;
        }
        if (add_pin(used, setup->soil_moisture_gpio, "soil_moisture", error, error_len) != ESP_OK) return ESP_ERR_INVALID_ARG;
    }
    if (setup->motion_enabled && add_pin(used, setup->motion_gpio, "motion", error, error_len) != ESP_OK) return ESP_ERR_INVALID_ARG;
    for (uint8_t i = 0; i < setup->relay_count; ++i) {
        char label[16];
        snprintf(label, sizeof(label), "relay_%u", (unsigned)(i + 1));
        if (add_pin(used, setup->relay_gpio[i], label, error, error_len) != ESP_OK) return ESP_ERR_INVALID_ARG;
    }
    return ESP_OK;
}

esp_err_t sm_hw_init(void)
{
    const sm_setup_t *setup = sm_setup();
    load_config_from_setup();

    ESP_LOGI(TAG, "Cấu hình phần cứng: dht11=%s (gpio=%d), soil=%s (gpio=%d), motion=%s (gpio=%d), relay=%u (%s)",
             s_config.dht11_enabled ? "có" : "không",
             s_config.dht11_enabled ? s_config.dht11_gpio : -1,
             s_config.soil_moisture_enabled ? "có" : "không",
             s_config.soil_moisture_enabled ? s_config.soil_moisture_gpio : -1,
             s_config.motion_enabled ? "có" : "không",
             s_config.motion_enabled ? s_config.motion_gpio : -1,
             (unsigned)s_config.relay_count,
             s_config.relay_active_high ? "cao" : "thấp");

    if (s_config.relay_count > SM_MAX_RELAYS) {
        ESP_LOGE(TAG, "NODE_RELAY_COUNT (%u) vượt quá giới hạn đã biên dịch (%d)",
                 (unsigned)s_config.relay_count, SM_MAX_RELAYS);
        return ESP_ERR_INVALID_ARG;
    }

    char validation_error[96];
    if (sm_hw_validate_setup(setup, validation_error, sizeof(validation_error)) != ESP_OK) {
        ESP_LOGE(TAG, "Cấu hình GPIO không hợp lệ: %s", validation_error);
        return ESP_ERR_INVALID_ARG;
    }

    if (s_config.dht11_enabled) {
        esp_err_t err = sm_dht11_init(s_config.dht11_gpio);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Khởi tạo DHT11 trên GPIO%d thất bại: %s", s_config.dht11_gpio, esp_err_to_name(err));
            return err;
        }
    }

    if (s_config.soil_moisture_enabled) {
        esp_err_t err = sm_soil_moisture_init(s_config.soil_moisture_gpio);
        if (err != ESP_OK) return err;
    }
    if (s_config.motion_enabled) {
        esp_err_t err = sm_motion_init(s_config.motion_gpio);
        if (err != ESP_OK) return err;
    }

    return sm_relay_init();
}
