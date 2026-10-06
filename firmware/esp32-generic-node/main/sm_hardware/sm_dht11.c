#include "sm_dht11.h"

#include <stdbool.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "freertos/task.h"
#include "sm_hardware.h"

static const char *TAG = "dht11";

/* DHT11 single-wire timing (datasheet) */
#define DHT_HOST_LOW_MS        20
#define DHT_RESPONSE_SETTLE_US 55
#define DHT_RESPONSE_TIMEOUT   150
#define DHT_PULSE_TIMEOUT      120
#define DHT_MIN_INTERVAL_MS    2000

static int s_gpio = -1;
static int64_t s_last_read_us = -1;
static portMUX_TYPE s_dht_timing_mux = portMUX_INITIALIZER_UNLOCKED;

/**
 * @brief Measure an EXPECTED level, never infer the phase from the current pin.
 *
 * @return elapsed microseconds, or -1 on timeout.
 */
static int measure_level(int gpio, int expected_level, int64_t timeout_us)
{
    if (gpio_get_level(gpio) != expected_level) {
        return -1;
    }
    const int64_t start = esp_timer_get_time();

    while (gpio_get_level(gpio) == expected_level) {
        if ((esp_timer_get_time() - start) > timeout_us) {
            return -1;
        }
    }
    return (int)(esp_timer_get_time() - start);
}

esp_err_t sm_dht11_init(int gpio_num)
{
    if (!GPIO_IS_VALID_OUTPUT_GPIO(gpio_num)) {
        return ESP_ERR_INVALID_ARG;
    }
    gpio_config_t io_conf = {
        .pin_bit_mask = 1ULL << gpio_num,
        .mode = GPIO_MODE_INPUT,
        /* Match Arduino INPUT_PULLUP: DATA must idle high after a sample.
         * Bare sensors may still need an external 4.7k-10k pull-up to 3.3V. */
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    esp_err_t err = gpio_config(&io_conf);
    if (err != ESP_OK) {
        return err;
    }

    s_gpio = gpio_num;
    s_last_read_us = esp_timer_get_time(); /* allow sensor startup time */
    ESP_LOGI(TAG, "Driver DHT11 level-sync-v2 sẵn sàng trên GPIO%d", gpio_num);
    return ESP_OK;
}

esp_err_t sm_dht11_read_once(int gpio_num, float *temperature_c, float *humidity_pct)
{
    if (!GPIO_IS_VALID_OUTPUT_GPIO(gpio_num) || temperature_c == NULL || humidity_pct == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    const int64_t now = esp_timer_get_time();
    if (s_last_read_us >= 0 && now - s_last_read_us < (int64_t)DHT_MIN_INTERVAL_MS * 1000) {
        return ESP_ERR_INVALID_STATE;
    }
    /* Failed reads also count: never immediately retrigger the sensor. */
    s_last_read_us = now;
    uint8_t data[5] = {0};
    int low_us[40] = {0};
    int high_us[40] = {0};

    esp_err_t err = gpio_set_direction(gpio_num, GPIO_MODE_INPUT);
    if (err != ESP_OK) return err;
    err = gpio_set_pull_mode(gpio_num, GPIO_PULLUP_ONLY);
    if (err != ESP_OK) return err;
    vTaskDelay(pdMS_TO_TICKS(1) + 1);
    err = gpio_set_level(gpio_num, 0);
    if (err != ESP_OK) return err;
    err = gpio_set_direction(gpio_num, GPIO_MODE_OUTPUT);
    if (err != ESP_OK) return err;
    /* Add one tick so scheduling phase cannot shorten the start pulse. */
    vTaskDelay(pdMS_TO_TICKS(DHT_HOST_LOW_MS) + 1);

    /* The frame uses ~50 us pulses. Wi-Fi interrupts can stretch a measured
     * high pulse and turn a zero into a one, corrupting the checksum. Keep
     * the response + 40-bit sampling window uninterrupted (about 4 ms). */
    const char *failed_phase = NULL;
    int failed_bit = -1;
    portENTER_CRITICAL(&s_dht_timing_mux);
    /* Release into INPUT_PULLUP rather than driving HIGH against the sensor.
     * Protect the release as well as the frame: otherwise an interrupt here
     * can consume the handshake before sampling even starts. */
    err = gpio_set_direction(gpio_num, GPIO_MODE_INPUT);
    if (err != ESP_OK) {
        failed_phase = "release";
    } else {
        /* Skip the pull-up rise and sensor's 20..40 us turnaround. At 55 us
         * we must be inside its ~80 us response LOW, as with Arduino DHT.h. */
        esp_rom_delay_us(DHT_RESPONSE_SETTLE_US);
    }
    /* We are now in the sensor's response LOW, even if it began before the
     * first GPIO observation. Consume LOW then HIGH, never three blind edges. */
    if (failed_phase == NULL && measure_level(gpio_num, 0, DHT_RESPONSE_TIMEOUT) < 0) {
        failed_phase = "response-low";
    }
    if (failed_phase == NULL && measure_level(gpio_num, 1, DHT_RESPONSE_TIMEOUT) < 0) {
        failed_phase = "response-high";
    }
    if (failed_phase == NULL) {
        for (int i = 0; i < 40; i++) {
            low_us[i] = measure_level(gpio_num, 0, DHT_PULSE_TIMEOUT);
            if (low_us[i] <= 0) {
                failed_phase = "data-low";
                failed_bit = i;
                break;
            }
            high_us[i] = measure_level(gpio_num, 1, DHT_PULSE_TIMEOUT);
            if (high_us[i] <= 0) {
                failed_phase = "data-high";
                failed_bit = i;
                break;
            }
        }
    }
    portEXIT_CRITICAL(&s_dht_timing_mux);
    (void)gpio_set_direction(gpio_num, GPIO_MODE_INPUT);
    if (failed_phase != NULL) {
        ESP_LOGW(TAG, "DHT11 GPIO%d: lỗi pha=%s, bit=%d (level-sync-v2)",
                 gpio_num, failed_phase, failed_bit);
        return err != ESP_OK ? err : ESP_ERR_TIMEOUT;
    }

    /* Decode outside the timing-critical window. Compare each high pulse to
     * its own ~50 us low pulse, instead of imposing one absolute threshold. */
    for (int i = 0; i < 40; ++i) {
        if (high_us[i] > low_us[i]) {
            data[i / 8] |= (uint8_t)(1u << (7 - i % 8));
        }
    }

    if ((uint8_t)(data[0] + data[1] + data[2] + data[3]) != data[4]) {
        ESP_LOGW(TAG, "Checksum không khớp: %02x %02x %02x %02x %02x",
                 data[0], data[1], data[2], data[3], data[4]);
        ESP_LOGW(TAG, "DHT11 xung bit đầu LOW/HIGH (us): %d/%d %d/%d %d/%d %d/%d",
                 low_us[0], high_us[0], low_us[1], high_us[1],
                 low_us[2], high_us[2], low_us[3], high_us[3]);
        return ESP_ERR_INVALID_STATE;
    }

    if (data[0] == 0 && data[2] == 0) {
        ESP_LOGW(TAG, "Cảm biến trả về toàn số 0");
        return ESP_ERR_INVALID_STATE;
    }

    *humidity_pct = (float)data[0] + ((float)data[1] / 10.0f);
    float temperature = (data[3] & 0x80) ? -1.0f - (float)data[2] : (float)data[2];
    temperature += (float)(data[3] & 0x0f) / 10.0f;
    *temperature_c = temperature;

    return ESP_OK;
}

esp_err_t sm_hw_dht11_read(float *temperature_c, float *humidity_pct)
{
    if (s_gpio < 0) {
        return ESP_ERR_INVALID_STATE;
    }

    return sm_dht11_read_once(s_gpio, temperature_c, humidity_pct);
}
