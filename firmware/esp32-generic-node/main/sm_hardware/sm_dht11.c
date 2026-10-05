#include "sm_dht11.h"

#include <math.h>
#include <stdbool.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sm_hardware.h"

static const char *TAG = "dht11";

/* DHT11 single-wire timing (datasheet) */
#define DHT_HOST_LOW_MS        20
#define DHT_HOST_HIGH_US       30
#define DHT_RESPONSE_TIMEOUT   150
#define DHT_PULSE_TIMEOUT      100
#define DHT_BIT1_THRESHOLD_US  50
#define DHT_MIN_INTERVAL_MS    1100

static int s_gpio = -1;
static int64_t s_last_read_us = -1000000;

/**
 * @brief Waits until the data line changes level and returns how long (us) it took.
 *
 * @return elapsed microseconds, or -1 on timeout.
 */
static int wait_level_change(int gpio, int64_t timeout_us)
{
    const int level = gpio_get_level(gpio);
    const int64_t start = esp_timer_get_time();

    while (gpio_get_level(gpio) == level) {
        if ((esp_timer_get_time() - start) > timeout_us) {
            return -1;
        }
        esp_rom_delay_us(1);
    }
    return (int)(esp_timer_get_time() - start);
}

esp_err_t sm_dht11_init(int gpio_num)
{
    gpio_config_t io_conf = {
        .pin_bit_mask = 1ULL << gpio_num,
        .mode = GPIO_MODE_INPUT_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    esp_err_t err = gpio_config(&io_conf);
    if (err != ESP_OK) {
        return err;
    }

    /* Idle state: host keeps the line low. */
    gpio_set_level(gpio_num, 0);
    s_gpio = gpio_num;
    ESP_LOGI(TAG, "Driver DHT11 sẵn sàng trên GPIO%d", gpio_num);
    return ESP_OK;
}

esp_err_t sm_dht11_read_once(int gpio_num, float *temperature_c, float *humidity_pct)
{
    if (gpio_num < 0 || temperature_c == NULL || humidity_pct == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    uint8_t data[5] = {0};

    /* Host start signal */
    gpio_set_level(gpio_num, 0);
    vTaskDelay(pdMS_TO_TICKS(DHT_HOST_LOW_MS));
    gpio_set_level(gpio_num, 1);
    esp_rom_delay_us(DHT_HOST_HIGH_US);
    gpio_set_direction(gpio_num, GPIO_MODE_INPUT); /* release the line to the pull-up */

    /* Sensor response: ~80 us low, ~80 us high */
    if (wait_level_change(gpio_num, DHT_RESPONSE_TIMEOUT) < 0) {
        goto sensor_absent;
    }
    if (wait_level_change(gpio_num, DHT_RESPONSE_TIMEOUT) < 0) {
        goto sensor_absent;
    }
    if (wait_level_change(gpio_num, DHT_RESPONSE_TIMEOUT) < 0) {
        goto sensor_absent;
    }

    /* 40 data bits: 50 us low, then a high pulse of ~26 us ('0') or ~70 us ('1') */
    for (int i = 0; i < 40; i++) {
        if (wait_level_change(gpio_num, DHT_PULSE_TIMEOUT) < 0) {
            goto read_failed;
        }
        const int high_us = wait_level_change(gpio_num, DHT_PULSE_TIMEOUT);
        if (high_us < 0) {
            goto read_failed;
        }

        const int byte_index = i / 8;
        const int bit_index = 7 - (i % 8);
        if (high_us > DHT_BIT1_THRESHOLD_US) {
            data[byte_index] |= (uint8_t)(1u << bit_index);
        }
    }

    if ((uint8_t)(data[0] + data[1] + data[2] + data[3]) != data[4]) {
        ESP_LOGW(TAG, "Checksum không khớp: %02x %02x %02x %02x %02x",
                 data[0], data[1], data[2], data[3], data[4]);
        goto read_failed;
    }

    if (data[0] == 0 && data[2] == 0) {
        ESP_LOGW(TAG, "Cảm biến trả về toàn số 0");
        goto read_failed;
    }

    *humidity_pct = (float)data[0] + ((float)data[1] / 10.0f);
    *temperature_c = (float)data[2] + ((float)data[3] / 10.0f);
    s_last_read_us = esp_timer_get_time();

    gpio_set_direction(gpio_num, GPIO_MODE_OUTPUT);
    gpio_set_level(gpio_num, 0);
    return ESP_OK;

sensor_absent:
    gpio_set_direction(gpio_num, GPIO_MODE_OUTPUT);
    gpio_set_level(gpio_num, 0);
    ESP_LOGW(TAG, "Không nhận được phản hồi từ cảm biến trên GPIO%d", gpio_num);
    return ESP_ERR_TIMEOUT;

read_failed:
    gpio_set_direction(gpio_num, GPIO_MODE_OUTPUT);
    gpio_set_level(gpio_num, 0);
    ESP_LOGW(TAG, "Không đọc được khung dữ liệu đầy đủ từ GPIO%d", gpio_num);
    return ESP_ERR_INVALID_STATE;
}

esp_err_t sm_hw_dht11_read(float *temperature_c, float *humidity_pct)
{
    if (s_gpio < 0) {
        return ESP_ERR_INVALID_STATE;
    }

    /* DHT11 must not be sampled faster than 1 Hz. */
    const int64_t now = esp_timer_get_time();
    if (s_last_read_us > 0 && (now - s_last_read_us) < (int64_t)DHT_MIN_INTERVAL_MS * 1000) {
        ESP_LOGW(TAG, "Bỏ qua lần đọc, DHT11 cần tối thiểu %d ms giữa hai lần lấy mẫu", DHT_MIN_INTERVAL_MS);
        return ESP_ERR_INVALID_STATE;
    }

    esp_err_t err = sm_dht11_read_once(s_gpio, temperature_c, humidity_pct);
    if (err == ESP_OK) {
        return ESP_OK;
    }

    /* DHT11 frequently needs one retry: the first frame after power-up is often
     * invalid. Never fabricate data - on failure the caller skips publishing. */
    esp_rom_delay_us(5000);
    return sm_dht11_read_once(s_gpio, temperature_c, humidity_pct);
}