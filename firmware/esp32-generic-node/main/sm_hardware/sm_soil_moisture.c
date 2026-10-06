#include "sm_soil_moisture.h"

#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"

static const char *TAG = "soil";
static adc_oneshot_unit_handle_t s_unit;
static adc_channel_t s_channel;
static bool s_ready;

esp_err_t sm_soil_moisture_init(int gpio_num)
{
    if (gpio_num < 0 || gpio_num > 4) return ESP_ERR_INVALID_ARG;
    if (!s_unit) {
        adc_oneshot_unit_init_cfg_t unit_config = { .unit_id = ADC_UNIT_1 };
        esp_err_t err = adc_oneshot_new_unit(&unit_config, &s_unit);
        if (err != ESP_OK) return err;
    }
    adc_unit_t unit_id;
    esp_err_t err = adc_oneshot_io_to_channel(gpio_num, &unit_id, &s_channel);
    if (err != ESP_OK) return err;
    if (unit_id != ADC_UNIT_1) return ESP_ERR_NOT_SUPPORTED;
    adc_oneshot_chan_cfg_t channel_config = { .bitwidth = ADC_BITWIDTH_DEFAULT, .atten = ADC_ATTEN_DB_12 };
    err = adc_oneshot_config_channel(s_unit, s_channel, &channel_config);
    if (err == ESP_OK) { s_ready = true; ESP_LOGI(TAG, "Cảm biến độ ẩm đất sẵn sàng trên GPIO%d", gpio_num); }
    return err;
}

esp_err_t sm_hw_soil_moisture_read(float *percent)
{
    if (!s_ready || !percent) return ESP_ERR_INVALID_STATE;
    int raw = 0;
    esp_err_t err = adc_oneshot_read(s_unit, s_channel, &raw);
    if (err != ESP_OK) return err;
    /* Common resistive probes read lower when wet. Per-probe calibration can
     * be added later without changing the telemetry/capability contract. */
    float value = 100.0f - ((float)raw * 100.0f / 4095.0f);
    *percent = value < 0 ? 0 : (value > 100 ? 100 : value);
    return ESP_OK;
}
