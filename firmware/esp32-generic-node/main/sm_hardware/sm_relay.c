#include "sm_relay.h"

#include <stdbool.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "sm_device.h"
#include "sm_hardware.h"

static const char *TAG = "relay";

static bool s_state[SM_MAX_RELAYS];

static int off_level(bool active_high)
{
    return active_high ? 0 : 1;
}

static int on_level(bool active_high)
{
    return active_high ? 1 : 0;
}

esp_err_t sm_relay_init(void)
{
    const sm_hw_config_t *hw = sm_hw_config();

    for (uint8_t i = 0; i < hw->relay_count && i < SM_MAX_RELAYS; i++) {
        const int gpio = hw->relay_gpio[i];

        gpio_config_t io_conf = {
            .pin_bit_mask = 1ULL << gpio,
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };

        esp_err_t err = gpio_config(&io_conf);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "relay_%u: gpio_config(GPIO%d) thất bại: %s", i + 1, gpio, esp_err_to_name(err));
            return err;
        }

        /* Safe default: OFF before anything else happens. */
        gpio_set_level(gpio, off_level(hw->relay_active_high));
        s_state[i] = false;

        /* Then restore the last applied state so a reboot keeps the house
         * consistent with what the Backend believes. */
        bool persisted = false;
        if (sm_device_load_relay_state(i + 1, &persisted) == ESP_OK) {
            gpio_set_level(gpio, persisted ? on_level(hw->relay_active_high)
                                           : off_level(hw->relay_active_high));
            s_state[i] = persisted;
            ESP_LOGI(TAG, "relay_%u trên GPIO%d được khôi phục về %s", i + 1, gpio, persisted ? "BẬT" : "TẮT");
        } else {
            ESP_LOGI(TAG, "relay_%u trên GPIO%d được khởi tạo ở trạng thái TẮT", i + 1, gpio);
        }
    }

    return ESP_OK;
}

bool sm_hw_relay_exists(uint8_t relay_index)
{
    const sm_hw_config_t *hw = sm_hw_config();
    return relay_index >= 1 && relay_index <= (uint8_t)hw->relay_count;
}

esp_err_t sm_hw_relay_set(uint8_t relay_index, bool on)
{
    const sm_hw_config_t *hw = sm_hw_config();

    if (!sm_hw_relay_exists(relay_index)) {
        return ESP_ERR_NOT_FOUND;
    }

    const int gpio = hw->relay_gpio[relay_index - 1];
    gpio_set_level(gpio, on ? on_level(hw->relay_active_high) : off_level(hw->relay_active_high));

    /* Relay boards normally do not expose a contact-feedback signal.  The
     * authoritative software State is therefore the command successfully
     * applied to the output pin, not an electrical read-back which can be
     * inverted by an active-low board or its transistor stage. */
    const int read_back = gpio_get_level(gpio);
    const int expected_level = on ? on_level(hw->relay_active_high)
                                  : off_level(hw->relay_active_high);
    if (read_back != expected_level) {
        ESP_LOGW(TAG, "relay_%u GPIO%d read-back=%d, expected=%d; reporting requested state",
                 relay_index, gpio, read_back, expected_level);
    }
    s_state[relay_index - 1] = on;

    ESP_LOGI(TAG, "relay_%u (GPIO%d) -> %s", relay_index, gpio, s_state[relay_index - 1] ? "BẬT" : "TẮT");

    if (sm_device_save_relay_state(relay_index, s_state[relay_index - 1]) != ESP_OK) {
        ESP_LOGW(TAG, "Không thể lưu trạng thái relay_%u vào NVS", relay_index);
    }
    return ESP_OK;
}

bool sm_hw_relay_get(uint8_t relay_index)
{
    if (!sm_hw_relay_exists(relay_index)) {
        return false;
    }

    /* This is a logical command state.  Physical contact feedback would need
     * a separate sensor capability, which a standard one-way relay has not. */
    return s_state[relay_index - 1];
}
