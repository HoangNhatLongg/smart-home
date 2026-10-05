#include <string.h>

#include "esp_log.h"
#include "sm_device.h"
#include "sm_nvs.h"

static const char *TAG = "device";

static char s_device_id[SM_ID_MAX_LEN];
static char s_home_id[SM_ID_MAX_LEN];
static char s_room_id[SM_ID_MAX_LEN];

static void copy_bounded(char *dst, size_t dst_len, const char *src)
{
    if (src == NULL || src[0] == '\0') {
        dst[0] = '\0';
        return;
    }
    strncpy(dst, src, dst_len - 1);
    dst[dst_len - 1] = '\0';
}

static void load_identity(char *dst, size_t dst_len, const char *nvs_key, const char *kconfig_default,
                         const char *kconfig_name)
{
    if (sm_nvs_read_str(nvs_key, dst, dst_len) == ESP_OK && dst[0] != '\0') {
        return;
    }

    copy_bounded(dst, dst_len, kconfig_default);
    if (dst[0] == '\0') {
        ESP_LOGE(TAG, "%s rỗng: cấu hình bằng `idf.py menuconfig`", kconfig_name);
    } else {
        ESP_LOGW(TAG, "%s không có trong NVS, dùng giá trị mặc định Kconfig '%s'", nvs_key, dst);
        sm_nvs_write_str(nvs_key, dst);
    }
}

esp_err_t sm_device_init(void)
{
    esp_err_t err = sm_nvs_open();
    if (err != ESP_OK) {
        return err;
    }

    load_identity(s_device_id, sizeof(s_device_id), SM_NVS_KEY_DEVICE_ID,
                  CONFIG_NODE_DEVICE_ID, "NODE_DEVICE_ID");
    load_identity(s_home_id, sizeof(s_home_id), SM_NVS_KEY_HOME_ID,
                  CONFIG_NODE_HOME_ID, "NODE_HOME_ID");
    load_identity(s_room_id, sizeof(s_room_id), SM_NVS_KEY_ROOM_ID,
                  CONFIG_NODE_ROOM_ID, "NODE_ROOM_ID");

    if (s_device_id[0] == '\0' || s_home_id[0] == '\0' || s_room_id[0] == '\0') {
        return ESP_ERR_INVALID_STATE;
    }

    ESP_LOGI(TAG, "device_id=%s home_id=%s room_id=%s firmware_version=%s",
             s_device_id, s_home_id, s_room_id, SM_FIRMWARE_VERSION);

    err = sm_node_config_init();
    return err;
}

const char *sm_device_id(void)
{
    return s_device_id;
}

const char *sm_home_id(void)
{
    return s_home_id;
}

const char *sm_room_id(void)
{
    return s_room_id;
}

const char *sm_firmware_version(void)
{
    return SM_FIRMWARE_VERSION;
}

esp_err_t sm_device_save_relay_state(uint8_t relay_index, bool on)
{
    if (relay_index == 0 || relay_index > SM_MAX_RELAYS) {
        return ESP_ERR_INVALID_ARG;
    }

    uint32_t bitmap = 0;
    (void)sm_nvs_read_bitmap(SM_NVS_KEY_RELAY_ST, &bitmap);

    if (on) {
        bitmap |= (1u << (relay_index - 1));
    } else {
        bitmap &= ~(1u << (relay_index - 1));
    }
    return sm_nvs_write_bitmap(SM_NVS_KEY_RELAY_ST, bitmap);
}

esp_err_t sm_device_load_relay_state(uint8_t relay_index, bool *out)
{
    if (relay_index == 0 || relay_index > SM_MAX_RELAYS) {
        return ESP_ERR_INVALID_ARG;
    }

    uint32_t bitmap = 0;
    esp_err_t err = sm_nvs_read_bitmap(SM_NVS_KEY_RELAY_ST, &bitmap);
    if (err != ESP_OK) {
        return err;
    }
    *out = (bitmap & (1u << (relay_index - 1))) != 0;
    return ESP_OK;
}

esp_err_t sm_device_load_wifi_credentials(sm_wifi_credentials_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(out, 0, sizeof(*out));

    /* Credentials written by the phone portal win, so a board can be moved to
     * another network without reflashing. */
    if (sm_nvs_read_str(SM_NVS_KEY_WIFI_SSID, out->ssid, sizeof(out->ssid)) == ESP_OK &&
        out->ssid[0] != '\0') {
        if (sm_nvs_read_str(SM_NVS_KEY_WIFI_PASS, out->password, sizeof(out->password)) != ESP_OK) {
            out->password[0] = '\0';
        }
        return ESP_OK;
    }

    copy_bounded(out->ssid, sizeof(out->ssid), CONFIG_NODE_WIFI_SSID);
    copy_bounded(out->password, sizeof(out->password), CONFIG_NODE_WIFI_PASSWORD);

    if (out->ssid[0] == '\0') {
        return ESP_ERR_NOT_FOUND;
    }

    /* Development path: remember the menuconfig credentials so the provisioning
     * portal is not offered again on the next boot. */
    ESP_LOGW(TAG, "Chưa có Wi-Fi trong NVS, dùng giá trị menuconfig '%s'", out->ssid);
    return sm_device_save_wifi_credentials(out->ssid, out->password);
}

esp_err_t sm_device_save_wifi_credentials(const char *ssid, const char *password)
{
    if (ssid == NULL || ssid[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }
    if (strlen(ssid) >= SM_WIFI_SSID_MAX_LEN) {
        return ESP_ERR_INVALID_SIZE;
    }
    if (password != NULL && strlen(password) >= SM_WIFI_PASS_MAX_LEN) {
        return ESP_ERR_INVALID_SIZE;
    }

    esp_err_t err = sm_nvs_write_str(SM_NVS_KEY_WIFI_PASS, password != NULL ? password : "");
    if (err != ESP_OK) {
        return err;
    }
    /* SSID last: its presence means "provisioned", so it must not be written
     * before the password is stored. */
    return sm_nvs_write_str(SM_NVS_KEY_WIFI_SSID, ssid);
}