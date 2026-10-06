#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_mac.h"
#include "nvs.h"
#include "sm_device.h"
#include "sm_nvs.h"

static const char *TAG = "device";

static char s_device_id[SM_ID_MAX_LEN];
static char s_home_id[SM_ID_MAX_LEN];
static char s_room_id[SM_ID_MAX_LEN];
static sm_setup_t s_setup;
static bool s_setup_loaded = false;

static void copy_bounded(char *dst, size_t dst_len, const char *src);

/* Preserve settings saved by firmware using 32-byte IDs before UUID-based
 * Home/Room pairing enlarged SM_ID_MAX_LEN. */
typedef struct {
    uint32_t version;
    char device_id[32];
    char home_id[32];
    char room_id[32];
    bool dht11_enabled;
    int dht11_gpio;
    uint8_t relay_count;
    int relay_gpio[2];
    bool relay_active_high;
    char broker_uri[SM_URI_MAX_LEN];
    char broker_username[SM_CRED_MAX_LEN];
    char broker_password[SM_CRED_MAX_LEN];
} sm_legacy_setup_t;

/* Original UUID-sized setup layout (two relay slots). */
typedef struct {
    uint32_t version;
    char device_id[SM_ID_MAX_LEN];
    char home_id[SM_ID_MAX_LEN];
    char room_id[SM_ID_MAX_LEN];
    bool dht11_enabled;
    int dht11_gpio;
    uint8_t relay_count;
    int relay_gpio[2];
    bool relay_active_high;
    char broker_uri[SM_URI_MAX_LEN];
    char broker_username[SM_CRED_MAX_LEN];
    char broker_password[SM_CRED_MAX_LEN];
} sm_setup_v1_t;

/* Version 2 added soil/PIR fields while retaining two relay slots. */
typedef struct {
    uint32_t version;
    char device_id[SM_ID_MAX_LEN];
    char home_id[SM_ID_MAX_LEN];
    char room_id[SM_ID_MAX_LEN];
    bool dht11_enabled;
    int dht11_gpio;
    bool soil_moisture_enabled;
    int soil_moisture_gpio;
    bool motion_enabled;
    int motion_gpio;
    uint8_t relay_count;
    int relay_gpio[2];
    bool relay_active_high;
    char broker_uri[SM_URI_MAX_LEN];
    char broker_username[SM_CRED_MAX_LEN];
    char broker_password[SM_CRED_MAX_LEN];
} sm_setup_v2_t;

static void migrate_v1(sm_setup_t *out, const sm_setup_v1_t *old)
{
    memset(out, 0, sizeof(*out));
    out->version = SM_SETUP_VERSION;
    copy_bounded(out->device_id, sizeof(out->device_id), old->device_id);
    copy_bounded(out->home_id, sizeof(out->home_id), old->home_id);
    copy_bounded(out->room_id, sizeof(out->room_id), old->room_id);
    out->dht11_enabled = old->dht11_enabled;
    out->dht11_gpio = old->dht11_gpio;
    out->soil_moisture_gpio = -1;
    out->motion_gpio = -1;
    out->relay_count = old->relay_count;
    memcpy(out->relay_gpio, old->relay_gpio, sizeof(old->relay_gpio));
    for (int i = 2; i < SM_MAX_RELAYS; ++i) out->relay_gpio[i] = -1;
    out->relay_active_high = old->relay_active_high;
    copy_bounded(out->broker_uri, sizeof(out->broker_uri), old->broker_uri);
    copy_bounded(out->broker_username, sizeof(out->broker_username), old->broker_username);
    copy_bounded(out->broker_password, sizeof(out->broker_password), old->broker_password);
}

static void migrate_v2(sm_setup_t *out, const sm_setup_v2_t *old)
{
    memset(out, 0, sizeof(*out));
    out->version = SM_SETUP_VERSION;
    copy_bounded(out->device_id, sizeof(out->device_id), old->device_id);
    copy_bounded(out->home_id, sizeof(out->home_id), old->home_id);
    copy_bounded(out->room_id, sizeof(out->room_id), old->room_id);
    out->dht11_enabled = old->dht11_enabled;
    out->dht11_gpio = old->dht11_gpio;
    out->soil_moisture_enabled = old->soil_moisture_enabled;
    out->soil_moisture_gpio = old->soil_moisture_gpio;
    out->motion_enabled = old->motion_enabled;
    out->motion_gpio = old->motion_gpio;
    out->relay_count = old->relay_count > 2 ? 2 : old->relay_count;
    memcpy(out->relay_gpio, old->relay_gpio, sizeof(old->relay_gpio));
    for (int i = 2; i < SM_MAX_RELAYS; ++i) out->relay_gpio[i] = -1;
    out->relay_active_high = old->relay_active_high;
    copy_bounded(out->broker_uri, sizeof(out->broker_uri), old->broker_uri);
    copy_bounded(out->broker_username, sizeof(out->broker_username), old->broker_username);
    copy_bounded(out->broker_password, sizeof(out->broker_password), old->broker_password);
}

/* Relay GPIO symbols only exist when the instance is enabled in Kconfig, so an
 * unused instance compiles to -1 and must never reach the GPIO API. */
static int kconfig_relay_gpio(int index)
{
#ifdef CONFIG_NODE_RELAY_1_GPIO
    if (index == 1) {
        return CONFIG_NODE_RELAY_1_GPIO;
    }
#endif
#ifdef CONFIG_NODE_RELAY_2_GPIO
    if (index == 2) {
        return CONFIG_NODE_RELAY_2_GPIO;
    }
#endif
#ifdef CONFIG_NODE_RELAY_3_GPIO
    if (index == 3) return CONFIG_NODE_RELAY_3_GPIO;
#endif
#ifdef CONFIG_NODE_RELAY_4_GPIO
    if (index == 4) return CONFIG_NODE_RELAY_4_GPIO;
#endif
#ifdef CONFIG_NODE_RELAY_5_GPIO
    if (index == 5) return CONFIG_NODE_RELAY_5_GPIO;
#endif
#ifdef CONFIG_NODE_RELAY_6_GPIO
    if (index == 6) return CONFIG_NODE_RELAY_6_GPIO;
#endif
#ifdef CONFIG_NODE_RELAY_7_GPIO
    if (index == 7) return CONFIG_NODE_RELAY_7_GPIO;
#endif
#ifdef CONFIG_NODE_RELAY_8_GPIO
    if (index == 8) return CONFIG_NODE_RELAY_8_GPIO;
#endif
    return -1;
}

static void copy_bounded(char *dst, size_t dst_len, const char *src)
{
    if (src == NULL || src[0] == '\0') {
        dst[0] = '\0';
        return;
    }
    strncpy(dst, src, dst_len - 1);
    dst[dst_len - 1] = '\0';
}



esp_err_t sm_setup_load(sm_setup_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t len = sizeof(*out);
    esp_err_t err = sm_nvs_read_blob(SM_NVS_KEY_SETUP, out, &len);

    if (err == ESP_OK && len == sizeof(*out) && out->version == SM_SETUP_VERSION) {
        s_setup = *out;
        s_setup_loaded = true;
        return ESP_OK;
    }

    if (err == ESP_OK && len == sizeof(sm_setup_v2_t)) {
        sm_setup_v2_t old;
        memcpy(&old, out, sizeof(old));
        if (old.version == 2) {
            migrate_v2(out, &old);
            s_setup = *out;
            s_setup_loaded = true;
            (void)sm_setup_save(out);
            ESP_LOGI(TAG, "Đã chuyển cấu hình NVS sang Generic Node v3 (mở rộng relay)");
            return ESP_OK;
        }
    }

    if (err == ESP_OK && len == sizeof(sm_setup_v1_t)) {
        sm_setup_v1_t old;
        memcpy(&old, out, sizeof(old));
        if (old.version == 1) {
            migrate_v1(out, &old);
            s_setup = *out;
            s_setup_loaded = true;
            (void)sm_setup_save(out);
            ESP_LOGI(TAG, "Đã chuyển cấu hình NVS sang Generic Node v2");
            return ESP_OK;
        }
    }

    if (err == ESP_OK && len == sizeof(sm_legacy_setup_t)) {
        sm_legacy_setup_t legacy_setup;
        memcpy(&legacy_setup, out, sizeof(legacy_setup));
        if (legacy_setup.version == 1) {
            sm_setup_v1_t old = {0};
            old.version = 1;
            copy_bounded(old.device_id, sizeof(old.device_id), legacy_setup.device_id);
            copy_bounded(old.home_id, sizeof(old.home_id), legacy_setup.home_id);
            copy_bounded(old.room_id, sizeof(old.room_id), legacy_setup.room_id);
            old.dht11_enabled = legacy_setup.dht11_enabled;
            old.dht11_gpio = legacy_setup.dht11_gpio;
            old.relay_count = legacy_setup.relay_count;
            memcpy(old.relay_gpio, legacy_setup.relay_gpio, sizeof(old.relay_gpio));
            old.relay_active_high = legacy_setup.relay_active_high;
            copy_bounded(old.broker_uri, sizeof(old.broker_uri), legacy_setup.broker_uri);
            copy_bounded(old.broker_username, sizeof(old.broker_username), legacy_setup.broker_username);
            copy_bounded(old.broker_password, sizeof(old.broker_password), legacy_setup.broker_password);
            migrate_v1(out, &old);
            s_setup = *out;
            s_setup_loaded = true;
            (void)sm_setup_save(out);
            ESP_LOGI(TAG, "Đã chuyển cấu hình NVS cũ sang định dạng UUID");
            return ESP_OK;
        }
    }

    if (err == ESP_OK) {
        /* Either the blob was written by another firmware version or the layout
         * changed. Rebuilding from Kconfig is safer than reading garbage. */
        ESP_LOGW(TAG, "Bản cấu hình trong NVS không tương thích, dựng lại từ menuconfig");
    }

    memset(out, 0, sizeof(*out));
    out->version = SM_SETUP_VERSION;

    /* Identity first comes from the per-key NVS entries, so nodes flashed
     * before setup_blob existed keep the ids they were already publishing. */
    char legacy[SM_ID_MAX_LEN];
    legacy[0] = '\0';
    if (sm_nvs_read_str(SM_NVS_KEY_DEVICE_ID, legacy, sizeof(legacy)) == ESP_OK &&
        legacy[0] != '\0') {
        copy_bounded(out->device_id, sizeof(out->device_id), legacy);
    } else {
        uint8_t mac[6] = {0};
        if (esp_read_mac(mac, ESP_MAC_WIFI_STA) == ESP_OK) {
            snprintf(out->device_id, sizeof(out->device_id), "esp32-c3-%02x%02x%02x%02x%02x%02x",
                     mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        } else {
            copy_bounded(out->device_id, sizeof(out->device_id), CONFIG_NODE_DEVICE_ID);
        }
    }
    legacy[0] = '\0';
    if (sm_nvs_read_str(SM_NVS_KEY_HOME_ID, legacy, sizeof(legacy)) == ESP_OK &&
        legacy[0] != '\0') {
        copy_bounded(out->home_id, sizeof(out->home_id), legacy);
    } else {
        copy_bounded(out->home_id, sizeof(out->home_id), CONFIG_NODE_HOME_ID);
    }
    legacy[0] = '\0';
    if (sm_nvs_read_str(SM_NVS_KEY_ROOM_ID, legacy, sizeof(legacy)) == ESP_OK &&
        legacy[0] != '\0') {
        copy_bounded(out->room_id, sizeof(out->room_id), legacy);
    } else {
        copy_bounded(out->room_id, sizeof(out->room_id), CONFIG_NODE_ROOM_ID);
    }

    out->dht11_enabled = CONFIG_NODE_DHT11_ENABLED;
    out->dht11_gpio = CONFIG_NODE_DHT11_ENABLED ? CONFIG_NODE_DHT11_GPIO : -1;
    out->soil_moisture_enabled = false;
    out->soil_moisture_gpio = -1;
    out->motion_enabled = false;
    out->motion_gpio = -1;
    out->relay_count = CONFIG_NODE_RELAY_COUNT;
    for (int i = 0; i < SM_MAX_RELAYS; ++i) out->relay_gpio[i] = kconfig_relay_gpio(i + 1);
    out->relay_active_high = CONFIG_NODE_RELAY_ACTIVE_HIGH;

    copy_bounded(out->broker_uri, sizeof(out->broker_uri), CONFIG_NODE_MQTT_BROKER_URI);
    copy_bounded(out->broker_username, sizeof(out->broker_username), CONFIG_NODE_MQTT_USERNAME);
    copy_bounded(out->broker_password, sizeof(out->broker_password), CONFIG_NODE_MQTT_PASSWORD);

    s_setup = *out;
    s_setup_loaded = true;

    err = sm_setup_save(out);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Không lưu được cấu hình mặc định vào NVS: %s", esp_err_to_name(err));
    }
    return ESP_OK;
}

esp_err_t sm_setup_save(const sm_setup_t *setup)
{
    if (setup == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (setup->version != SM_SETUP_VERSION) {
        return ESP_ERR_INVALID_ARG;
    }
    return sm_nvs_write_blob(SM_NVS_KEY_SETUP, setup, sizeof(*setup));
}

const sm_setup_t *sm_setup(void)
{
    return s_setup_loaded ? &s_setup : NULL;
}

const char *sm_broker_uri(void)
{
    return s_setup_loaded ? s_setup.broker_uri : CONFIG_NODE_MQTT_BROKER_URI;
}

const char *sm_broker_username(void)
{
    return s_setup_loaded ? s_setup.broker_username : CONFIG_NODE_MQTT_USERNAME;
}

const char *sm_broker_password(void)
{
    return s_setup_loaded ? s_setup.broker_password : CONFIG_NODE_MQTT_PASSWORD;
}

esp_err_t sm_device_init(void)
{
    esp_err_t err = sm_nvs_open();
    if (err != ESP_OK) {
        return err;
    }

    /* The setup blob is the single source of truth for identity; individual
     * keys are kept in sync so older tooling and manual NVS dumps still work. */
    err = sm_setup_load(&s_setup);
    if (err != ESP_OK) {
        return err;
    }

    copy_bounded(s_device_id, sizeof(s_device_id), s_setup.device_id);
    copy_bounded(s_home_id, sizeof(s_home_id), s_setup.home_id);
    copy_bounded(s_room_id, sizeof(s_room_id), s_setup.room_id);

    if (s_device_id[0] == '\0') {
        ESP_LOGE(TAG, "Không tạo được device_id");
        return ESP_ERR_INVALID_STATE;
    }

    /* Mirror the blob into the plain keys so a human can still read identity
     * straight out of NVS without decoding a blob. */
    (void)sm_nvs_write_str(SM_NVS_KEY_DEVICE_ID, s_device_id);
    (void)sm_nvs_write_str(SM_NVS_KEY_HOME_ID, s_home_id);
    (void)sm_nvs_write_str(SM_NVS_KEY_ROOM_ID, s_room_id);

    ESP_LOGI(TAG, "device_id=%s home_id=%s room_id=%s firmware_version=%s",
             s_device_id, s_home_id, s_room_id, SM_FIRMWARE_VERSION);

    err = sm_node_config_init();
    return err;
}

const char *sm_device_id(void)
{
    return s_device_id;
}

bool sm_device_is_paired(void)
{
    return s_home_id[0] != '\0' && s_room_id[0] != '\0' && sm_broker_uri()[0] != '\0';
}

esp_err_t sm_device_clear_pairing(void)
{
    sm_setup_t updated = s_setup;
    updated.home_id[0] = '\0';
    updated.room_id[0] = '\0';
    updated.broker_uri[0] = '\0';
    updated.broker_username[0] = '\0';
    updated.broker_password[0] = '\0';
    esp_err_t err = sm_setup_save(&updated);
    if (err != ESP_OK) return err;
    err = sm_nvs_erase_key(SM_NVS_KEY_DEV_SECRET);
    if (err != ESP_OK) return err;
    err = sm_nvs_erase_key(SM_NVS_KEY_PAIR_CODE);
    if (err != ESP_OK) return err;
    return sm_nvs_write_u32(SM_NVS_KEY_PAIR_RESET, 1);
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

    uint32_t reset_requested = 0;
    if (sm_nvs_read_u32(SM_NVS_KEY_WIFI_RESET, &reset_requested) == ESP_OK && reset_requested != 0) {
        ESP_LOGI(TAG, "Đang chờ cấu hình Wi-Fi mới qua SoftAP");
        return ESP_ERR_NVS_NOT_FOUND;
    }

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
    err = sm_nvs_write_str(SM_NVS_KEY_WIFI_SSID, ssid);
    if (err != ESP_OK) {
        return err;
    }
    return sm_nvs_erase_key(SM_NVS_KEY_WIFI_RESET);
}

esp_err_t sm_device_reset_wifi_credentials(void)
{
    esp_err_t err = sm_nvs_write_u32(SM_NVS_KEY_WIFI_RESET, 1);
    if (err != ESP_OK) {
        return err;
    }
    err = sm_nvs_erase_key(SM_NVS_KEY_WIFI_PASS);
    if (err != ESP_OK) {
        return err;
    }
    return sm_nvs_erase_key(SM_NVS_KEY_WIFI_SSID);
}
