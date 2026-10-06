#include "sm_motion.h"
#include "driver/gpio.h"
#include "esp_log.h"
static int s_gpio = -1;
esp_err_t sm_motion_init(int gpio_num) { gpio_config_t cfg = { .pin_bit_mask = 1ULL << gpio_num, .mode = GPIO_MODE_INPUT, .pull_up_en = GPIO_PULLUP_DISABLE, .pull_down_en = GPIO_PULLDOWN_DISABLE, .intr_type = GPIO_INTR_DISABLE }; esp_err_t err = gpio_config(&cfg); if (err == ESP_OK) { s_gpio = gpio_num; ESP_LOGI("motion", "PIR sẵn sàng trên GPIO%d", gpio_num); } return err; }
esp_err_t sm_hw_motion_read(bool *detected) { if (s_gpio < 0 || !detected) return ESP_ERR_INVALID_STATE; *detected = gpio_get_level(s_gpio) != 0; return ESP_OK; }
