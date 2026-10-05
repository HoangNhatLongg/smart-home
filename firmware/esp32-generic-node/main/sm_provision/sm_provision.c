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
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "sm_device.h"

static const char *TAG = "provision";

#define PROV_FORM_MAX_LEN 256
#define PROV_SSID_MAX_LEN 32
#define PROV_PASS_MAX_LEN 64
#define PROV_PASS_MIN_LEN 8
#define PROV_AP_NAME "SmartHomeNode"
#define PROV_RESTART_DELAY_MS 1500

static httpd_handle_t s_httpd;
static char s_ap_ssid[32];

static const char PROV_PAGE_HEAD[] =
    "<!DOCTYPE html><html lang=\"vi\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>Cấu hình Wi-Fi</title><style>"
    "body{font-family:sans-serif;background:#f2f4f7;margin:0;padding:24px}"
    "div{background:#fff;border-radius:12px;padding:20px;max-width:420px;margin:auto}"
    "h1{font-size:20px;margin:0 0 8px}p{color:#555;font-size:14px;line-height:1.5}"
    "code{background:#eee;padding:2px 6px;border-radius:4px;font-size:13px}"
    "input{width:100%;box-sizing:border-box;padding:12px;margin:6px 0 12px;"
    "border:1px solid #ccc;border-radius:8px;font-size:16px}"
    "button{width:100%;padding:13px;background:#1e88e5;color:#fff;border:0;"
    "border-radius:8px;font-size:16px}"
    ".err{color:#c62828;font-weight:bold}</style></head><body><div>";

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

    const char *start = strstr(body, needle);
    if (start == NULL) {
        return -1;
    }
    start += strlen(needle);

    char encoded[PROV_FORM_MAX_LEN];
    size_t len = 0;
    while (*start != '\0' && *start != '&' && len + 1 < sizeof(encoded)) {
        encoded[len++] = *start++;
    }
    encoded[len] = '\0';

    return url_decode(encoded, out, out_len);
}

static esp_err_t send_page(httpd_req_t *req, const char *title, const char *body_html)
{
    char page[1024];
    int len = snprintf(page, sizeof(page), "%s<h1>%s</h1>%s%s", PROV_PAGE_HEAD, title, body_html,
                       PROV_PAGE_TAIL);
    if (len < 0) {
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req, page, (size_t)len);
}

static esp_err_t form_handler(httpd_req_t *req)
{
    char body[PROV_FORM_MAX_LEN];
    size_t received = 0;
    while (received < sizeof(body) - 1) {
        int ret = httpd_req_recv(req, body + received, sizeof(body) - 1 - received);
        if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
            continue;
        }
        if (ret <= 0) {
            break;
        }
        received += (size_t)ret;
    }
    body[received] = '\0';

    char ssid[SM_WIFI_SSID_MAX_LEN] = {0};
    char pass[SM_WIFI_PASS_MAX_LEN] = {0};
    bool has_pass = form_field(body, "password", pass, sizeof(pass)) > 0;

    if (form_field(body, "ssid", ssid, sizeof(ssid)) <= 0) {
        ESP_LOGW(TAG, "Thiếu SSID trong yêu cầu");
        return send_page(req, "Cấu hình Wi-Fi", "<p class=\"err\">Thiếu tên Wi-Fi (SSID).</p>");
    }

    size_t ssid_len = strlen(ssid);
    size_t pass_len = strlen(pass);
    if (ssid_len > PROV_SSID_MAX_LEN) {
        return send_page(req, "Cấu hình Wi-Fi",
                         "<p class=\"err\">Tên Wi-Fi tối đa 32 ký tự.</p>");
    }
    if (has_pass && pass_len < PROV_PASS_MIN_LEN) {
        return send_page(req, "Cấu hình Wi-Fi",
                         "<p class=\"err\">Mật khẩu Wi-Fi tối thiểu 8 ký tự.</p>");
    }
    if (pass_len > PROV_PASS_MAX_LEN) {
        return send_page(req, "Cấu hình Wi-Fi",
                         "<p class=\"err\">Mật khẩu Wi-Fi tối đa 64 ký tự.</p>");
    }

    esp_err_t err = sm_device_save_wifi_credentials(ssid, pass);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Lưu Wi-Fi vào NVS thất bại: %s", esp_err_to_name(err));
        return send_page(req, "Cấu hình Wi-Fi",
                         "<p class=\"err\">Không lưu được, hãy thử lại.</p>");
    }

    ESP_LOGI(TAG, "Đã lưu Wi-Fi '%s', khởi động lại node", ssid);
    sm_provision_schedule_restart();

    char escaped_ap[128];
    html_escape(s_ap_ssid, escaped_ap, sizeof(escaped_ap));

    char done_body[512];
    snprintf(done_body, sizeof(done_body),
             "<p>Thiết bị <code>%s</code> (%s) đang khởi động lại và kết nối vào mạng "
             "của bạn.</p>"
             "<p>Thiết bị sẽ không còn phát mạng <code>%s</code> nữa. Nếu trình duyệt không "
             "chuyển trang, hãy tắt rồi bật lại Wi-Fi trên điện thoại.</p>",
             sm_device_id(), sm_room_id(), escaped_ap);
    return send_page(req, "Đã lưu cấu hình", done_body);
}

static esp_err_t root_handler(httpd_req_t *req)
{
    char escaped_ap[128];
    html_escape(s_ap_ssid, escaped_ap, sizeof(escaped_ap));

    char body[512];
    snprintf(body, sizeof(body),
             "<p>Thiết bị <code>%s</code> (%s) chưa có Wi-Fi nào được lưu.</p>"
             "<p>Nối điện thoại vào mạng <code>%s</code> rồi điền tên và mật khẩu Wi-Fi "
             "nhà bạn.</p>"
             "<form method=\"POST\" action=\"/\">"
             "<input name=\"ssid\" maxlength=\"32\" placeholder=\"Tên Wi-Fi (SSID)\" required>"
             "<input name=\"password\" type=\"password\" maxlength=\"64\" "
             "placeholder=\"Mật khẩu Wi-Fi\">"
             "<button type=\"submit\">Lưu và kết nối</button></form>",
             sm_device_id(), sm_room_id(), escaped_ap);
    return send_page(req, "Cấu hình Wi-Fi", body);
}

/* Android/iOS probe this path to decide whether to show a "sign in to network"
 * dialog; answering with a redirect is what pops the portal up automatically. */
static esp_err_t captive_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "/");
    return httpd_resp_send(req, NULL, 0);
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
    config.stack_size = 4096;
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

    esp_err_t register_err = httpd_register_uri_handler(s_httpd, &form);
    if (register_err == ESP_OK) {
        register_err = httpd_register_uri_handler(s_httpd, &root);
    }
    if (register_err == ESP_OK) {
        register_err = httpd_register_uri_handler(s_httpd, &captive);
    }
    if (register_err != ESP_OK) {
        ESP_LOGE(TAG, "Đăng ký HTTP handler thất bại: %s", esp_err_to_name(register_err));
    }
    return register_err;
}

esp_err_t sm_provision_start(void)
{
    build_ap_ssid(s_ap_ssid, sizeof(s_ap_ssid));

    /* Returns a handle, not an esp_err_t, so it cannot use ESP_ERROR_CHECK. */
    if (esp_netif_create_default_wifi_ap() == NULL) {
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

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGW(TAG, "Chưa có Wi-Fi trong NVS: đã mở AP '%s' (%s)", s_ap_ssid,
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