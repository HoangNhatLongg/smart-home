#include "sm_provision.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "cJSON.h"
#include "sm_device.h"
#include "sm_hardware.h"
#include "sm_nvs.h"

static const char *TAG = "provision";

/* Leave room for the percent-encoded values and names of all eight relay
 * selectors. Mobile browsers can encode non-ASCII SSIDs/passwords as 3 bytes
 * per character, so avoid silently rejecting a valid form near the limit. */
#define PROV_FORM_MAX_LEN 2048
/* Longest single value is the broker URI (127 bytes), so 3x for encoding. */
#define PROV_FIELD_MAX_LEN 384
#define PROV_SSID_MAX_LEN 32
#define PROV_PASS_MAX_LEN 64
#define PROV_PASS_MIN_LEN 8
#define PROV_AP_NAME "SmartHomeNode"
#define PROV_RESTART_DELAY_MS 30000

static httpd_handle_t s_httpd;
static char s_ap_ssid[32];

static const char PROV_PAGE_HEAD[] =
    "<!DOCTYPE html><html lang=\"vi\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>Cấu hình thiết bị</title><style>"
    "body{font-family:sans-serif;background:#f2f4f7;margin:0;padding:20px}"
    "div{background:#fff;border-radius:12px;padding:20px;max-width:460px;margin:auto}"
    "h1{font-size:20px;margin:0 0 6px}h2{font-size:15px;margin:22px 0 8px;color:#333}"
    "p{color:#555;font-size:14px;line-height:1.5}"
    "label{display:block;font-size:13px;color:#333;margin:10px 0 3px}"
    "code{background:#eee;padding:2px 6px;border-radius:4px;font-size:13px}"
    "input,select{width:100%;box-sizing:border-box;padding:10px;margin:0 0 4px;"
    "border:1px solid #ccc;border-radius:8px;font-size:15px}"
    "button{width:100%;padding:13px;background:#1e88e5;color:#fff;border:0;"
    "border-radius:8px;font-size:16px;margin-top:18px}"
    ".err{color:#c62828;font-weight:bold}.hint{color:#777;font-size:12px}"
    ".chk{display:flex;align-items:center;gap:8px;margin:10px 0}"
    ".chk input{width:auto;margin:0}</style></head><body><div>";

static const char PROV_PAGE_TAIL[] =
    "</div></body></html>";

static void html_escape(const char *in, char *out, size_t out_len)
{
    size_t pos = 0;
    for (size_t i = 0; in[i] != '\0' && pos + 7 < out_len; i++) {
        switch (in[i]) {
        case '&':
            memcpy(out + pos, "&amp;", 5);
            pos += 5;
            break;
        case '<':
            memcpy(out + pos, "&lt;", 4);
            pos += 4;
            break;
        case '>':
            memcpy(out + pos, "&gt;", 4);
            pos += 4;
            break;
        case '"':
            memcpy(out + pos, "&quot;", 6);
            pos += 6;
            break;
        default:
            out[pos++] = in[i];
            break;
        }
    }
    out[pos] = '\0';
}

/* Form bodies arrive url-encoded, so "+" is a space and "%XX" is a raw byte. */
static int url_decode(const char *in, char *out, size_t out_len)
{
    size_t pos = 0;
    for (size_t i = 0; in[i] != '\0' && pos + 1 < out_len; i++) {
        if (in[i] == '+') {
            out[pos++] = ' ';
        } else if (in[i] == '%' && isxdigit((unsigned char)in[i + 1]) &&
                   isxdigit((unsigned char)in[i + 2])) {
            char hex[3] = {in[i + 1], in[i + 2], '\0'};
            out[pos++] = (char)strtol(hex, NULL, 16);
            i += 2;
        } else {
            out[pos++] = in[i];
        }
    }
    out[pos] = '\0';
    return (int)pos;
}

static int form_field(const char *body, const char *name, char *out, size_t out_len)
{
    char needle[24];
    snprintf(needle, sizeof(needle), "%s=", name);
    size_t needle_len = strlen(needle);

    /* The name must start a field, otherwise "password=" would also match
     * inside "broker_password=" and the wrong value would be decoded. */
    const char *start = NULL;
    for (const char *p = body; (p = strstr(p, needle)) != NULL; p += needle_len) {
        if (p == body || p[-1] == '&') {
            start = p + needle_len;
            break;
        }
    }
    if (start == NULL) {
        return -1;
    }

    /* One field's percent-encoded value: worst case three chars per byte. */
    char encoded[PROV_FIELD_MAX_LEN];
    size_t len = 0;
    while (*start != '\0' && *start != '&' && len + 1 < sizeof(encoded)) {
        encoded[len++] = *start++;
    }
    encoded[len] = '\0';

    return url_decode(encoded, out, out_len);
}

static esp_err_t send_page(httpd_req_t *req, const char *title, const char *body_html)
{
    /* PROV_PAGE_HEAD alone is ~1.6 KB and the setup form ~1.2 KB, so the page
     * has to be assembled in chunks: one local buffer big enough for the whole
     * document would overflow the HTTP task stack. */
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");

    char head[64];
    int len = snprintf(head, sizeof(head), "<h1>%s</h1>", title);
    if (len < 0) {
        return ESP_FAIL;
    }

    esp_err_t err = httpd_resp_send_chunk(req, PROV_PAGE_HEAD, HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) {
        return err;
    }
    err = httpd_resp_send_chunk(req, head, (size_t)len);
    if (err != ESP_OK) {
        return err;
    }
    err = httpd_resp_send_chunk(req, body_html, HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) {
        return err;
    }
    err = httpd_resp_send_chunk(req, PROV_PAGE_TAIL, HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) return err;
    return httpd_resp_send_chunk(req, NULL, 0);
}

static esp_err_t send_error(httpd_req_t *req, const char *message)
{
    char body[256];
    snprintf(body, sizeof(body), "<p class=\"err\">%s</p><p><a href=\"/\">Quay lại</a></p>",
             message);
    return send_page(req, "Cấu hình không hợp lệ", body);
}

/* Numeric form fields are attacker-controlled input: reject anything that is
 * not a plain in-range decimal number before it reaches the GPIO API. */
static bool parse_uint(const char *text, long min, long max, long *out)
{
    if (text == NULL || text[0] == '\0') {
        return false;
    }
    for (const char *p = text; *p != '\0'; p++) {
        if (*p < '0' || *p > '9') {
            return false;
        }
    }
    long value = strtol(text, NULL, 10);
    if (value < min || value > max) {
        return false;
    }
    *out = value;
    return true;
}

static bool parse_gpio(const char *text, int *out)
{
    long value = 0;
    if (!parse_uint(text, SM_GPIO_MIN, SM_GPIO_MAX, &value)) {
        return false;
    }
    *out = (int)value;
    return true;
}

static esp_err_t form_handler(httpd_req_t *req)
{
    char body[PROV_FORM_MAX_LEN];
    if (req->content_len <= 0) {
        return send_error(req, "Biểu mẫu không có dữ liệu.");
    }
    if (req->content_len > (int)sizeof(body) - 1) {
        return send_error(req, "Dữ liệu gửi lên quá lớn.");
    }

    const size_t expected = (size_t)req->content_len;
    size_t received = 0;
    int timeouts = 0;
    while (received < expected) {
        int ret = httpd_req_recv(req, body + received, expected - received);
        if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
            if (++timeouts >= 3) {
                ESP_LOGW(TAG, "Nhận biểu mẫu quá thời gian (%u/%u byte)",
                         (unsigned)received, (unsigned)expected);
                return send_error(req, "Kết nối gửi cấu hình bị gián đoạn. Hãy thử lại.");
            }
            continue;
        }
        if (ret <= 0) {
            ESP_LOGW(TAG, "Nhận biểu mẫu thất bại (%u/%u byte, lỗi %d)",
                     (unsigned)received, (unsigned)expected, ret);
            return send_error(req, "Không nhận đủ cấu hình. Hãy thử lại.");
        }
        received += (size_t)ret;
        timeouts = 0;
    }
    body[received] = '\0';

    char ssid[SM_WIFI_SSID_MAX_LEN] = {0};
    char pass[SM_WIFI_PASS_MAX_LEN] = {0};
    char backend[SM_URI_MAX_LEN] = {0};
    char dht_gpio[8] = {0};

    bool has_pass = form_field(body, "password", pass, sizeof(pass)) > 0;

    if (form_field(body, "ssid", ssid, sizeof(ssid)) <= 0) {
        return send_error(req, "Thiếu tên Wi-Fi (SSID).");
    }
    if (strlen(ssid) > PROV_SSID_MAX_LEN) {
        return send_error(req, "Tên Wi-Fi tối đa 32 ký tự.");
    }
    if (!has_pass) {
        sm_wifi_credentials_t stored = {0};
        if (sm_device_load_wifi_credentials(&stored) == ESP_OK && strcmp(ssid, stored.ssid) == 0) {
            snprintf(pass, sizeof(pass), "%s", stored.password);
            has_pass = pass[0] != '\0';
        }
    }
    if (has_pass && strlen(pass) < PROV_PASS_MIN_LEN) {
        return send_error(req, "Mật khẩu Wi-Fi tối thiểu 8 ký tự.");
    }
    if (strlen(pass) > PROV_PASS_MAX_LEN) {
        return send_error(req, "Mật khẩu Wi-Fi tối đa 64 ký tự.");
    }

    if (form_field(body, "backend_url", backend, sizeof(backend)) <= 0 ||
        (strncmp(backend, "http://", 7) != 0 && strncmp(backend, "https://", 8) != 0)) {
        return send_error(req, "Backend URL phải bắt đầu bằng http:// hoặc https://");
    }
    size_t backend_len = strlen(backend);
    while (backend_len > 0 && backend[backend_len - 1] == '/') backend[--backend_len] = '\0';

    /* Unchecked boxes are simply absent from the form body. */
    bool dht11_enabled = form_field(body, "dht11_enabled", dht_gpio, sizeof(dht_gpio)) > 0;

    /* atoi() would silently accept "2abc", so the relay count goes through the
     * same strict parser as the GPIO numbers. */
    int relay_count = 0;
    char relay_count_text[8] = {0};
    long relay_count_parsed = 0;
    if (form_field(body, "relay_count", relay_count_text, sizeof(relay_count_text)) > 0 &&
        !parse_uint(relay_count_text, 0, SM_MAX_RELAYS, &relay_count_parsed)) {
        return send_error(req, "Số relay phải nằm trong khoảng 0 đến 8.");
    }
    relay_count = (int)relay_count_parsed;

    sm_setup_t setup = {0};
    setup.version = SM_SETUP_VERSION;
    setup.dht11_enabled = dht11_enabled;
    setup.relay_count = (uint8_t)relay_count;
    setup.relay_active_high = form_field(body, "relay_active_high", relay_count_text,
                                         sizeof(relay_count_text)) > 0 && relay_count_text[0] != '0';

    if (dht11_enabled && !parse_gpio(form_field(body, "dht11_gpio", dht_gpio, sizeof(dht_gpio)) > 0
                                          ? dht_gpio : NULL,
                                      &setup.dht11_gpio)) {
        return send_error(req, "GPIO của DHT11 phải là số từ 0 đến 21.");
    }
    setup.dht11_gpio = dht11_enabled ? setup.dht11_gpio : -1;

    for (int i = 0; i < SM_MAX_RELAYS; i++) {
        char name[24];
        snprintf(name, sizeof(name), "relay_gpio_%d", i + 1);
        char buf[8] = {0};
        int gpio = -1;

        if (i < relay_count) {
            if (!parse_gpio(form_field(body, name, buf, sizeof(buf)) > 0 ? buf : NULL, &gpio)) {
                char message[80];
                snprintf(message, sizeof(message), "GPIO của relay %d phải là số từ 0 đến 21.",
                         i + 1);
                return send_error(req, message);
            }
        }
        setup.relay_gpio[i] = gpio;
    }

    /* Initialize every unused slot explicitly; setup blobs grow with the
     * supported relay count and must not contain accidental GPIO0 entries. */
    for (int i = relay_count; i < SM_MAX_RELAYS; i++) setup.relay_gpio[i] = -1;

    const sm_setup_t *previous = sm_setup();
    uint32_t wifi_reset = 0;
    char existing_secret[65] = {0};
    bool has_secret = sm_nvs_read_str(SM_NVS_KEY_DEV_SECRET, existing_secret, sizeof(existing_secret)) == ESP_OK;
    bool keep_pairing = previous != NULL && sm_device_is_paired() &&
        ((sm_nvs_read_u32(SM_NVS_KEY_WIFI_RESET, &wifi_reset) == ESP_OK && wifi_reset != 0) ||
         has_secret);
    if (previous != NULL) {
        snprintf(setup.device_id, sizeof(setup.device_id), "%s", previous->device_id);
        /* Generic peripherals are managed by Dashboard after pairing; a
         * Wi-Fi-only change in this local portal must not disable them. */
        setup.soil_moisture_enabled = previous->soil_moisture_enabled;
        setup.soil_moisture_gpio = previous->soil_moisture_gpio;
        setup.motion_enabled = previous->motion_enabled;
        setup.motion_gpio = previous->motion_gpio;
        if (keep_pairing) {
            snprintf(setup.home_id, sizeof(setup.home_id), "%s", previous->home_id);
            snprintf(setup.room_id, sizeof(setup.room_id), "%s", previous->room_id);
            snprintf(setup.broker_uri, sizeof(setup.broker_uri), "%s", previous->broker_uri);
            snprintf(setup.broker_username, sizeof(setup.broker_username), "%s", previous->broker_username);
            snprintf(setup.broker_password, sizeof(setup.broker_password), "%s", previous->broker_password);
        }
    }

    char gpio_error[112];
    if (sm_hw_validate_setup(&setup, gpio_error, sizeof(gpio_error)) != ESP_OK) {
        return send_error(req, gpio_error);
    }

    /* Order matters. wifi_ssid is the flag that tells the next boot to skip the
     * access point, so the setup blob has to be committed first: if it fails the
     * node stays unprovisioned and reopens the portal instead of joining the
     * network with stale hardware or broker settings. */
    esp_err_t err = sm_setup_save(&setup);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Lưu cấu hình thiết bị thất bại: %s", esp_err_to_name(err));
        return send_error(req, "Không lưu được cấu hình thiết bị.");
    }

    err = sm_nvs_write_str(SM_NVS_KEY_BACKEND, backend);
    if (err != ESP_OK) return send_error(req, "Không lưu được Backend URL.");

    char pairing_code[11] = {0};
    if (!keep_pairing) {
        if (!has_secret || sm_nvs_read_str(SM_NVS_KEY_PAIR_CODE, pairing_code, sizeof(pairing_code)) != ESP_OK) {
            const char alphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            uint8_t random_code[10];
            uint8_t random_secret[32];
            esp_fill_random(random_code, sizeof(random_code));
            esp_fill_random(random_secret, sizeof(random_secret));
            char secret[65];
            for (int i = 0; i < 10; i++) pairing_code[i] = alphabet[random_code[i] % (sizeof(alphabet) - 1)];
            for (int i = 0; i < 32; i++) snprintf(secret + 2 * i, 3, "%02x", random_secret[i]);
            if (sm_nvs_write_str(SM_NVS_KEY_DEV_SECRET, secret) != ESP_OK ||
                sm_nvs_write_str(SM_NVS_KEY_PAIR_CODE, pairing_code) != ESP_OK) {
                return send_error(req, "Không lưu được mã ghép nối.");
            }
        }
    }

    err = sm_device_save_wifi_credentials(ssid, pass);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Lưu Wi-Fi vào NVS thất bại: %s", esp_err_to_name(err));
        return send_error(req, "Không lưu được cấu hình Wi-Fi.");
    }
    if (sm_nvs_erase_key(SM_NVS_KEY_PAIR_RESET) != ESP_OK) return send_error(req, "Không đóng được chế độ ghép nối lại.");

    ESP_LOGI(TAG, "Đã lưu Wi-Fi '%s', dht11=%s, relay=%u; Backend %s",
             ssid, setup.dht11_enabled ? "có" : "không", (unsigned)setup.relay_count, backend);
    sm_provision_schedule_restart();

    char escaped_ap[128];
    html_escape(s_ap_ssid, escaped_ap, sizeof(escaped_ap));

    /* Three chunks instead of one snprintf: the escaped AP name plus three
     * identifiers can exceed any single stack buffer on the HTTP task. */
    char line[512];

    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");

    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");

    err = httpd_resp_send_chunk(req, PROV_PAGE_HEAD, HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) {
        return err;
    }

    snprintf(line, sizeof(line), "<h1>Đã lưu cấu hình</h1>"
             "<p>Thiết bị <code>%s</code> đang kết nối Wi-Fi <code>%s</code>.</p>"
             "<p>Mã ghép nối: <strong><code>%s</code></strong>. Hãy lưu mã này. Sau 30 giây ESP vào mạng, mở Dashboard → Thiết bị → Thêm thiết bị và nhập mã.</p>",
             setup.device_id, ssid, pairing_code[0] ? pairing_code : "Đã ghép nối");
    err = httpd_resp_send_chunk(req, line, HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) {
        return err;
    }

    snprintf(line, sizeof(line),
             "<p>Thiết bị sẽ không còn phát mạng <code>%s</code> nữa. Nếu trình duyệt không "
             "chuyển trang, hãy tắt rồi bật lại Wi-Fi trên điện thoại.</p>",
             escaped_ap);
    err = httpd_resp_send_chunk(req, line, HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) return err;
    return httpd_resp_send_chunk(req, NULL, 0);
}

static esp_err_t root_handler(httpd_req_t *req)
{
    char escaped_ap[128];
    html_escape(s_ap_ssid, escaped_ap, sizeof(escaped_ap));

    const sm_setup_t *setup = sm_setup();

    /* Pre-filled from the stored setup so a re-provision only changes what the
     * user actually edited. Every value goes through html_escape() because it
     * ends up inside an HTML attribute. */
    char backend[256] = "";
    char saved_ssid[SM_WIFI_SSID_MAX_LEN] = {0};
    sm_wifi_credentials_t saved_wifi = {0};
    if (sm_device_load_wifi_credentials(&saved_wifi) == ESP_OK)
        html_escape(saved_wifi.ssid, saved_ssid, sizeof(saved_ssid));
    char stored_backend[SM_URI_MAX_LEN] = {0};
    if (sm_nvs_read_str(SM_NVS_KEY_BACKEND, stored_backend, sizeof(stored_backend)) != ESP_OK)
        snprintf(stored_backend, sizeof(stored_backend), "%s", CONFIG_NODE_BACKEND_URL);
    html_escape(stored_backend, backend, sizeof(backend));
    const char *dht_checked = "";
    char active_high_sel[2] = "0";
    char gpio[SM_MAX_RELAYS + 1][16] = {{0}};
    bool used_gpio[SM_GPIO_MAX + 1] = {false};
    static const int allowed_gpios[] = {0, 1, 3, 4, 5, 6, 7, 10, 11};
    char relay_count_options[768] = {0};
    char dht_gpio_options[1200] = {0};
    char *relay_gpio_controls = calloc(1, 6000);
    if (relay_gpio_controls == NULL) return httpd_resp_send_500(req);
    size_t count_used = 0, dht_used = 0, relay_used = 0;

    for (int count = 0; count <= SM_MAX_RELAYS; ++count) {
        char count_label[24];
        if (count == 0) snprintf(count_label, sizeof(count_label), "Không dùng relay");
        else snprintf(count_label, sizeof(count_label), "%d relay", count);
        int written = snprintf(relay_count_options + count_used, sizeof(relay_count_options) - count_used,
                               "<option value=\"%d\"%s>%s</option>", count,
                               setup && setup->relay_count == count ? " selected" : "",
                               count_label);
        if (written > 0 && (size_t)written < sizeof(relay_count_options) - count_used) count_used += (size_t)written;
    }
    for (size_t pin_index = 0; pin_index < sizeof(allowed_gpios) / sizeof(allowed_gpios[0]); ++pin_index) {
        const int pin = allowed_gpios[pin_index];
        int written = snprintf(dht_gpio_options + dht_used, sizeof(dht_gpio_options) - dht_used,
                               "<option value=\"%d\"%s>GPIO %d</option>", pin,
                               setup && setup->dht11_gpio == pin ? " selected" : "", pin);
        if (written > 0 && (size_t)written < sizeof(dht_gpio_options) - dht_used) dht_used += (size_t)written;
    }

    if (setup != NULL) {
        dht_checked = setup->dht11_enabled ? " checked" : "";
        active_high_sel[0] = setup->relay_active_high ? '1' : '0';
        const int dht_pin = setup->dht11_gpio >= SM_GPIO_MIN ? setup->dht11_gpio : 4;
        snprintf(gpio[0], sizeof(gpio[0]), "%d", dht_pin);
        if (setup->dht11_enabled && dht_pin <= SM_GPIO_MAX) used_gpio[dht_pin] = true;
        if (setup->soil_moisture_enabled && setup->soil_moisture_gpio >= SM_GPIO_MIN && setup->soil_moisture_gpio <= SM_GPIO_MAX)
            used_gpio[setup->soil_moisture_gpio] = true;
        if (setup->motion_enabled && setup->motion_gpio >= SM_GPIO_MIN && setup->motion_gpio <= SM_GPIO_MAX)
            used_gpio[setup->motion_gpio] = true;
        for (int i = 0; i < SM_MAX_RELAYS; i++) {
            int pin = setup->relay_gpio[i];
            bool supported = false;
            for (size_t j = 0; j < sizeof(allowed_gpios) / sizeof(allowed_gpios[0]); ++j)
                if (pin == allowed_gpios[j]) supported = true;
            if (!supported || used_gpio[pin]) {
                pin = -1;
                for (size_t j = 0; j < sizeof(allowed_gpios) / sizeof(allowed_gpios[0]); ++j) {
                    if (!used_gpio[allowed_gpios[j]]) { pin = allowed_gpios[j]; break; }
                }
            }
            if (pin >= SM_GPIO_MIN && pin <= SM_GPIO_MAX) used_gpio[pin] = true;
            snprintf(gpio[i + 1], sizeof(gpio[i + 1]), "%d", pin);
        }
    }

    for (int relay = 0; relay < SM_MAX_RELAYS; ++relay) {
        int written = snprintf(relay_gpio_controls + relay_used, 6000 - relay_used,
                               "<div data-relay-index=\"%d\"><label>GPIO relay %d</label><select name=\"relay_gpio_%d\"><option value=\"\">Chọn GPIO</option>",
                               relay + 1, relay + 1, relay + 1);
        if (written <= 0 || (size_t)written >= 6000 - relay_used) break;
        relay_used += (size_t)written;
        for (size_t pin_index = 0; pin_index < sizeof(allowed_gpios) / sizeof(allowed_gpios[0]); ++pin_index) {
            const int pin = allowed_gpios[pin_index];
            written = snprintf(relay_gpio_controls + relay_used, 6000 - relay_used,
                               "<option value=\"%d\"%s>GPIO %d</option>", pin,
                               atoi(gpio[relay + 1]) == pin ? " selected" : "", pin);
            if (written <= 0 || (size_t)written >= 6000 - relay_used) break;
            relay_used += (size_t)written;
        }
        written = snprintf(relay_gpio_controls + relay_used, 6000 - relay_used, "</select></div>");
        if (written <= 0 || (size_t)written >= 6000 - relay_used) break;
        relay_used += (size_t)written;
    }

    char *form = calloc(1, 16000);
    if (form == NULL) {
        free(relay_gpio_controls);
        return httpd_resp_send_500(req);
    }
    snprintf(form, 16000,
             "<p>Nối điện thoại vào mạng <code>%s</code> rồi điền thông tin bên dưới. "
             "Cấu hình được lưu vào bộ nhớ của thiết bị và có hiệu lực sau khi khởi "
             "động lại.</p>"
             "<form method=\"POST\" action=\"/\">"
             "<label>Tên Wi-Fi (SSID)</label>"
             "<select id=\"wifi_list\"><option value=\"\">Đang tìm Wi-Fi gần đây...</option></select>"
             "<input id=\"ssid\" name=\"ssid\" maxlength=\"32\" value=\"%s\" placeholder=\"Có thể nhập thủ công\" required>"
             "<label>Mật khẩu Wi-Fi</label>"
             "<input name=\"password\" type=\"password\" maxlength=\"64\" "
             "placeholder=\"bỏ trống nếu mạng không mật khẩu\">"
             "<h2>Kết nối Backend</h2>"
             "<label>Backend URL trên mạng Wi-Fi <span class=\"hint\">(IP của máy chủ, không dùng localhost)</span></label>"
             "<input name=\"backend_url\" maxlength=\"127\" value=\"%s\" required>"
             "<h2>Phần cứng</h2>"
             "<div class=\"chk\"><input type=\"checkbox\" name=\"dht11_enabled\" value=\"1\"%s>"
             "<label style=\"margin:0\">Có cảm biến DHT11</label></div>"
             "<label>Chân GPIO của DHT11</label>"
             "<select name=\"dht11_gpio\">%s</select>"
             "<label>Số relay (tối đa 8)</label>"
             "<select name=\"relay_count\">%s</select>"
             "%s"
             "<label>Mức kích hoạt relay</label>"
             "<select name=\"relay_active_high\">"
             "<option value=\"1\"%s>Active HIGH (GPIO = 1 là BẬT)</option>"
             "<option value=\"0\"%s>Active LOW (module relay 5V)</option></select>"
             "<p id=\"gpio_warning\" style=\"display:none;color:#b91c1c\"></p>"
             "<button id=\"save_button\" type=\"submit\">Lưu và kết nối</button></form>"
             "<script>fetch('/scan').then(r=>r.json()).then(list=>{const s=document.getElementById('wifi_list');"
             "s.replaceChildren(new Option('Chọn Wi-Fi gần đây',''));list.forEach(w=>s.add(new Option(w.ssid+' ('+w.rssi+' dBm)',w.ssid)));"
             "s.onchange=()=>{document.getElementById('ssid').value=s.value}}).catch(()=>{"
             "document.getElementById('wifi_list').replaceChildren(new Option('Không quét được, hãy nhập tên Wi-Fi',''))});"
             "const gpioSelects=[...document.querySelectorAll('select[name=\\\"dht11_gpio\\\"],select[name^=\\\"relay_gpio_\\\"]')];"
             "function updateGpios(){const count=Number(document.querySelector('[name=\\\"relay_count\\\"]').value);"
             "const dhtOn=document.querySelector('[name=\\\"dht11_enabled\\\"]').checked;"
             "const active=gpioSelects.filter(s=>(s.name==='dht11_gpio'&&dhtOn)||(s.name.startsWith('relay_gpio_')&&Number(s.name.split('_').pop())<=count));"
             "rows.forEach(row=>row.style.display=Number(row.dataset.relayIndex)<=count?'':'none');"
             "let values=active.map(s=>s.value).filter(Boolean);let duplicate=new Set(values).size!==values.length;let missing=active.some(s=>!s.value);"
             "active.forEach(s=>[...s.options].forEach(o=>{o.disabled=!!o.value&&o.value!==s.value&&active.some(other=>other!==s&&other.value===o.value)}));"
             "const warning=document.getElementById('gpio_warning');warning.textContent=duplicate?'Mỗi thiết bị phải dùng một GPIO riêng.':(missing?'Hãy chọn GPIO cho tất cả relay đang bật.':'');"
             "warning.style.display=(duplicate||missing)?'block':'none';document.getElementById('save_button').disabled=duplicate||missing}"
             "const rows=[...document.querySelectorAll('[data-relay-index]')];"
             "gpioSelects.forEach(s=>s.addEventListener('change',updateGpios));"
             "document.querySelector('[name=\\\"relay_count\\\"]').addEventListener('change',updateGpios);"
             "document.querySelector('[name=\\\"dht11_enabled\\\"]').addEventListener('change',updateGpios);updateGpios();</script>",
             escaped_ap, saved_ssid, backend, dht_checked, dht_gpio_options,
             relay_count_options, relay_gpio_controls,
             active_high_sel[0] == '1' ? " selected" : "",
             active_high_sel[0] == '1' ? "" : " selected");

    esp_err_t err = send_page(req, "Cấu hình thiết bị", form);
    free(form);
    free(relay_gpio_controls);
    return err;
}

/* Android/iOS probe this path to decide whether to show a "sign in to network"
 * dialog; answering with a redirect is what pops the portal up automatically. */
static esp_err_t captive_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "/");
    return httpd_resp_send(req, NULL, 0);
}

static esp_err_t scan_handler(httpd_req_t *req)
{
    wifi_scan_config_t scan = {0};
    if (esp_wifi_scan_start(&scan, true) != ESP_OK) {
        httpd_resp_set_status(req, "503 Service Unavailable");
        return httpd_resp_sendstr(req, "[]");
    }
    wifi_ap_record_t records[12] = {0};
    uint16_t count = 12;
    if (esp_wifi_scan_get_ap_records(&count, records) != ESP_OK) count = 0;
    cJSON *list = cJSON_CreateArray();
    for (int i = 0; i < count; i++) {
        if (records[i].ssid[0] == '\0') continue;
        cJSON *item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "ssid", (const char *)records[i].ssid);
        cJSON_AddNumberToObject(item, "rssi", records[i].rssi);
        cJSON_AddItemToArray(list, item);
    }
    char *body = cJSON_PrintUnformatted(list);
    cJSON_Delete(list);
    if (!body) return httpd_resp_send_500(req);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    esp_err_t err = httpd_resp_sendstr(req, body);
    free(body);
    return err;
}

static void restart_timer_cb(void *arg)
{
    (void)arg;
    ESP_LOGI(TAG, "Khởi động lại để kết nối mạng đã cấu hình");
    esp_restart();
}

static void build_ap_ssid(char *out, size_t out_len)
{
    uint8_t mac[6] = {0};
    esp_err_t err = esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP);
    if (err != ESP_OK) {
        err = esp_read_mac(mac, ESP_MAC_WIFI_STA);
    }
    if (err != ESP_OK) {
        snprintf(out, out_len, "%s", PROV_AP_NAME);
        return;
    }
    snprintf(out, out_len, "%s-%02X%02X", PROV_AP_NAME, mac[4], mac[5]);
}

static esp_err_t http_start(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = CONFIG_NODE_PROVISION_PORT;
    config.max_uri_handlers = 4;
    config.stack_size = 8192;
    config.lru_purge_enable = true;

    esp_err_t err = httpd_start(&s_httpd, &config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Không khởi động được HTTP server: %s", esp_err_to_name(err));
        return err;
    }

    httpd_uri_t form = {
        .uri = "/",
        .method = HTTP_POST,
        .handler = form_handler,
    };
    httpd_uri_t root = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = root_handler,
    };
    httpd_uri_t captive = {
        .uri = "/generate_204",
        .method = HTTP_GET,
        .handler = captive_handler,
    };
    httpd_uri_t scan_uri = { .uri = "/scan", .method = HTTP_GET, .handler = scan_handler };

    esp_err_t register_err = httpd_register_uri_handler(s_httpd, &form);
    if (register_err == ESP_OK) {
        register_err = httpd_register_uri_handler(s_httpd, &root);
    }
    if (register_err == ESP_OK) {
        register_err = httpd_register_uri_handler(s_httpd, &captive);
    }
    if (register_err == ESP_OK) register_err = httpd_register_uri_handler(s_httpd, &scan_uri);
    if (register_err != ESP_OK) {
        ESP_LOGE(TAG, "Đăng ký HTTP handler thất bại: %s", esp_err_to_name(register_err));
    }
    return register_err;
}

esp_err_t sm_provision_start(void)
{
    build_ap_ssid(s_ap_ssid, sizeof(s_ap_ssid));

    /* Returns a handle, not an esp_err_t, so it cannot use ESP_ERROR_CHECK. */
    if (esp_netif_create_default_wifi_ap() == NULL || esp_netif_create_default_wifi_sta() == NULL) {
        ESP_LOGE(TAG, "Tạo netif AP thất bại");
        return ESP_FAIL;
    }

    wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_config));

    const char *ap_pass = CONFIG_NODE_PROVISION_AP_PASSWORD;
    bool secured = strlen(ap_pass) >= PROV_PASS_MIN_LEN;
    if (!secured) {
        ESP_LOGW(TAG, "Mật khẩu AP ngắn hơn 8 ký tự: mở AP không mật khẩu");
    }

    wifi_config_t ap_config = {0};
    memcpy(ap_config.ap.ssid, s_ap_ssid, strlen(s_ap_ssid) + 1);
    snprintf((char *)ap_config.ap.password, sizeof(ap_config.ap.password), "%s", ap_pass);
    ap_config.ap.ssid_len = (uint8_t)strlen(s_ap_ssid);
    ap_config.ap.channel = 1;
    ap_config.ap.max_connection = 1;
    ap_config.ap.authmode = secured ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGW(TAG, "Đã mở AP cấu hình '%s' (%s)", s_ap_ssid,
             secured ? "có mật khẩu" : "không mật khẩu");
    ESP_LOGI(TAG, "Mở trình duyệt tại http://192.168.4.1 để nhập SSID và mật khẩu Wi-Fi");

    return http_start();
}

esp_err_t sm_provision_schedule_restart(void)
{
    const esp_timer_create_args_t timer_args = {
        .callback = restart_timer_cb,
    };
    esp_timer_handle_t timer;
    esp_err_t err = esp_timer_create(&timer_args, &timer);
    if (err != ESP_OK) {
        return err;
    }
    err = esp_timer_start_once(timer, PROV_RESTART_DELAY_MS * 1000);
    if (err != ESP_OK) {
        esp_timer_delete(timer);
    }
    return err;
}
