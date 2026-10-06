# Hướng dẫn đọc Firmware — Generic ESP32-C3 Node

Tài liệu này dành cho người **mới tiếp nhận codebase**: đọc để hiểu firmware đang làm gì,
code nằm ở đâu, các đường đi của dữ liệu chạy theo thứ tự nào, và khi cần sửa một tính năng
thì nên mở file nào.

> Tài liệu này **không thay thế** contract. Nguồn chuẩn về giao thức vẫn là
> `docs/MQTT_SPEC.md` và `docs/SYSTEM_SPEC.md`. Firmware tuân thủ chúng, không tự sinh topic.
> Tài liệu build/flash ngắn gọn nằm ở `README.md` cùng thư mục.

---

## 1. Firmware này làm gì

Một binary duy nhất chạy được cho **mọi node phần cứng** của dự án: node có DHT11 + 1 relay,
node có DHT11 và không relay, node dự phòng không cảm biến. Khác biệt giữa các node chỉ nằm ở
cấu hình `menuconfig`, **không** nằm trong code.

| Node giao tiếp với Backend qua EMQX:

```text
                    ┌──────────────┐
   DHT11 ──GPIO──►  │              │  ──MQTT──►  EMQX  ◄──►  Backend
   Relay  ◄─GPIO──  │  ESP32-C3    │
                    └──────────────┘
```

Ngoài MQTT, node còn có một đường cấu hình riêng: khi NVS chưa có Wi-Fi, node **tự phát một
mạng Wi-Fi riêng (SoftAP) và mở web form** để điện thoại nhập SSID/mật khẩu nhà — xem mục 4b.

| Tính năng | Hướng | Topic | Dùng để làm gì |
|-----------|-------|-------|----------------|
| Availability | node ↔ backend | `availability` | Backend biết node online/offline (retained + LWT) |
| Capability | node → backend | `capability` | Khai báo node có `temperature`, `humidity`, `relay_1`… |
| Telemetry | node → backend | `telemetry` | Nhiệt độ/độ ẩm mỗi 30 giây |
| Command | backend → node | `command` | Bật/tắt relay |
| State | node → backend | `state` | Xác nhận trạng thái relay sau mỗi command |
| Configuration | backend ↔ node | `config` | Đổi chu kỳ telemetry, đặt tên relay (lưu NVS) |
| OTA | backend ↔ node | `ota` | Cập nhật firmware qua HTTPS |

---

## 2. Yêu cầu để đọc/sửa code

```powershell
cd C:\CNTT\IOT\DoAn\smart-home\firmware\esp32-generic-node
. "C:\Espressif\frameworks\esp-idf-v5.5.5\export.ps1"
idf.py menuconfig     # cấu hình node
idf.py build
idf.py -p COMx flash monitor
```

Trước khi flash, **bắt buộc** đặt `NODE_DEVICE_ID`, `NODE_ROOM_ID`, `NODE_MQTT_BROKER_URI`.
`NODE_WIFI_SSID`/`NODE_WIFI_PASSWORD` có thể **để trống** — khi đó node mở AP cấu hình để
điện thoại nhập Wi-Fi (mục 4b). `sdkconfig` chứa secret nên đã git-ignore.

---

## 3. Bản đồ thư mục

```text
firmware/esp32-generic-node/
├── CMakeLists.txt          đọc version từ Kconfig, khai báo 13 component
├── partitions.csv          nvs + 2 app slot 1536K (OTA)
├── sdkconfig.defaults      target ESP32-C3, 4 MB flash, TLS bundle
├── README.md               build/flash/cấu hình nhanh
├── FIRMWARE_GUIDE.md       tài liệu này
└── main/
    ├── app_main.c          entry point (20 dòng)
    ├── Kconfig.projbuild   toàn bộ cấu hình, không hardcode trong .c
    └── sm_*/               13 component, mỗi thư mục = 1 ESP-IDF component
```

| Thư mục | File chính | Dòng | Trách nhiệm |
|---------|-------------|------|-------------|
| `sm_app/` | `sm_app.c` | 136 | Điều phối khởi động, đăng ký callback MQTT |
| | `sm_wifi.c` | 129 | Chọn STA hay provisioning, reconnect, khởi động MQTT khi có IP |
| `sm_device/` | `sm_device_identity.c` | 165 | Identity, relay state, Wi-Fi credentials (NVS → fallback Kconfig) |
| | `sm_device_config.c` | 103 | Cấu hình đã áp dụng: parse JSON, lưu NVS, khôi phục sau reboot |
| | `sm_nvs.c` | 104 | Hạ tầng NVS: string/u32/bitmap |
| | `sm_device_time.c` | 66 | SNTP + timestamp UTC ISO-8601 |
| | `sm_topic.c` | 35 | Dựng `smarthome/{home}/{room}/{device}/{suffix}` |
| `sm_mqtt/` | `sm_mqtt.c` | 317 | Client MQTT, LWT, subscribe, 2 queue, ghép payload phân mảnh |
| `sm_provision/` | `sm_provision.c` | 338 | SoftAP + HTTP server, web form nhận Wi-Fi từ điện thoại |
| `sm_hardware/` | `sm_dht11.c` | 166 | Driver DHT11 tự viết bằng timing + GPIO |
| | `sm_relay.c` | 106 | Relay: bật/tắt GPIO, đọc lại pin, lưu NVS |
| | `sm_hardware.c` | 74 | Gom cấu hình phần cứng, khởi tạo, kiểm tra GPIO trùng |
| `sm_telemetry/` | `sm_telemetry.c` | 152 | Task định kỳ đọc DHT11 và phát telemetry |
| `sm_command/` | `sm_command.c` | 113 | Parse + validate `set_relay` |
| `sm_configuration/` | `sm_configuration.c` | 177 | Nhận config, validate, lưu NVS, phát response |
| `sm_ota/` | `sm_ota.c` | 346 | `esp_https_ota`, verify SHA-256, đổi slot, restart |
| `sm_state/` | `sm_state.c` | 76 | Publish state retained kèm `command_id` |
| `sm_capability/` | `sm_capability.c` | 71 | Sinh danh sách capability từ phần cứng |
| `sm_availability/` | `sm_availability.c` | 47 | Publish availability online |

Tổng khoảng **3.200 dòng C** (35 file). Không có framework, không có dependency ngoài ESP-IDF + cJSON.

**Tại sao thư mục có tiền tố `sm_`?** ESP-IDF đã có sẵn component tên `mqtt`. Component trong
`EXTRA_COMPONENT_DIRS` phải có tên khác, nên mọi thư mục được đặt tên `sm_<tính năng>`.
Tên component trong `CMakeLists.txt` khớp với tên thư mục, **và mỗi component mới phải được
thêm vào `NODE_MODULE_DIRS` trong `CMakeLists.txt` gốc** — quên bước này sẽ ra lỗi
`Failed to resolve component` lúc build.

---

## 4. Luồng khởi động

`app_main.c` → `sm_app_start()` (`sm_app/sm_app.c:76`). Thứ tự này **có chủ đích**:

| # | Bước | Hàm | Vì sao ở vị trí này |
|---|------|-----|--------------------|
| 1 | Log chip + flash size | `sm_app_start` | Chỉ để đối chiếu khi debug |
| 2 | `nvs_flash_init` | `init_nvs` | Mọi thứ sau đó đều đọc NVS |
| 3 | `sm_device_init` | `sm_device_identity.c` | Nạp identity + config; relay restore cần NVS |
| 4 | `sm_hw_init` | `sm_hardware.c` | GPIO relay, DHT11; relay khôi phục state từ NVS |
| 5 | `sm_mqtt_init` | `sm_mqtt.c` | Tạo client + queue, **chưa** kết nối |
| 6 | `sm_ota_init` | `sm_ota.c` | Chỉ ghi log trạng thái |
| 7 | `sm_wifi_start` | `sm_wifi.c` | Bắt đầu STA; khi có IP mới gọi `sm_mqtt_start`. Nếu chưa có Wi-Fi thì rẽ sang provisioning (4b) |
| 8 | `sm_time_init` | `sm_device_time.c` | SNTP cần network → phải **sau** bước 7 |
| 9 | `sm_telemetry_start` | `sm_telemetry.c` | Task chờ MQTT + đồng bộ thời gian rồi mới lấy mẫu |

Sau khi có IP và MQTT kết nối, `on_mqtt_event()` phát theo thứ tự:

```text
availability (online, retained)  →  capability (retained)  →  state (retained)
```

Đây là đúng tinh thần "Availability + Wi-Fi MQTT phải có trước, rồi tới telemetry, command,
state, capability" của yêu cầu dự án: Backend phải thấy node online trước khi nhận capability.

### 4b. Nhánh provisioning (cấu hình thiết bị từ điện thoại)

Bước 7 ở trên rẽ nhánh: `sm_wifi_start()` gọi `sm_device_load_wifi_credentials()`, và nếu
NVS **chưa có** `wifi_ssid` thì `NODE_PROVISION_ENABLED` bật thì gọi `sm_provision_start()`.

```text
node boot
   └─ NVS có wifi_ssid?
        ├─ có  ──► Wi-Fi STA → có IP → MQTT → SNTP → telemetry   (đường bình thường)
        └─ không ─► sm_provision_start()
                     ├─ SoftAP "SmartHomeNode-A1B2" (mật khẩu smarthome123, WPA2, 1 client)
                     ├─ HTTP server :80
                     │     GET  /               → form: Wi-Fi + identity + GPIO + broker
                     │                           (điền sẵn theo setup_blob hiện có)
                     │     POST /               → validate → lưu setup_blob → lưu wifi_ssid
                     │                           → hẹn restart sau 1.5 s
                     │     GET  /generate_204   → 302 về "/" (ép popup captive portal)
                     └─ (node chờ, không có MQTT) → restart → vào nhánh "có" ở trên
```

Form SoftAP chỉ gửi SSID/mật khẩu Wi-Fi, Backend URL và cấu hình GPIO/DHT11/relay.
`device_id` được sinh từ MAC; Home/Room/broker do Dashboard cấp sau khi nhập mã ghép nối.
ESP đăng ký mã qua REST và kiểm tra bootstrap mỗi 10 giây. Xem `sm_setup_t` trong
`sm_device.h` và `setup_blob` (version `SM_SETUP_VERSION`).

### 4c. Đổi Wi-Fi bằng nút BOOT

Khi node đã được cấu hình, giữ **BOOT** ít nhất `NODE_WIFI_RESET_HOLD_SECONDS`
(mặc định 5 giây), rồi nhả trước 15 giây. Firmware xóa riêng `wifi_ssid`/`wifi_pass`,
đặt cờ provisioning rồi khởi động lại. Node sẽ mở
SoftAP và cho nhập Wi-Fi mới tại `http://192.168.4.1`.

Giữ BOOT đủ 15 giây sẽ xóa toàn bộ NVS (factory reset). Nếu thiết bị đã được ghép
trên Dashboard, hãy xóa bản ghi thiết bị cũ trước khi ghép lại. Nút “Bỏ ghép nối”
trên Dashboard thu hồi thiết bị trên Backend; ESP thấy HTTP 403 ở bootstrap kế tiếp,
giữ Wi-Fi/GPIO và mở lại SoftAP để sinh mã ghép nối mới.

Reset này không xóa `setup_blob`, identity (`device_id`, `home_id`, `room_id`), broker, GPIO,
relay state hoặc configuration. Trên ESP32-C3 phổ biến, BOOT là GPIO9; cấu hình qua
`NODE_WIFI_RESET_BUTTON_GPIO` và không dùng GPIO này cho relay/sensor.

Điểm cần biết khi đọc code:

| Điều | Giải thích |
|------|------------|
| Vì sao không dùng component `wifi_provisioning` của ESP-IDF | Nó cần app đi kèm của Espressif + protobuf sinh trước khi build. HTTP server viết tay chỉ cần trình duyệt điện thoại, không cài gì thêm |
| `setup_blob` ghi **trước** `wifi_ssid` | `wifi_ssid` là cờ "đã provisioning". Ghi nó sau cùng để nếu lưu cấu hình hỏng thì node vẫn mở lại AP thay vì nối mạng thật với GPIO/broker cũ |
| `wifi_ssid` được ghi **sau** `wifi_pass` | Nếu ghi SSID trước rồi chết giữa chừng, node sẽ tưởng đã có Wi-Fi nhưng lại không có mật khẩu → không cấu hình lại được |
| Ưu tiên NVS hơn Kconfig | `menuconfig` chỉ còn là factory default cho lần boot đầu; đổi ngược lại thì xóa NVS |
| Thiếu `setup_blob` → dựng lại từ Kconfig | Board đã flash trước đây vẫn giữ identity cũ: `sm_setup_load()` đọc `device_id`/`home_id`/`room_id` từ key NVS riêng trước khi fallback về Kconfig |
| Stack task HTTP = 8192 | Handler gửi HTML bằng `httpd_resp_send_chunk()` theo từng đoạn nhỏ thay vì dựng cả trang trong một buffer cục bộ |
| Validate GPIO ngay trong form | `parse_uint()` từ chối mọi ký tự không phải số trước khi chạm GPIO API, và form cũng chặn trường hợp DHT11/relay trùng chân |
| AP tắt sau khi lưu | `esp_restart()` chuyển radio sang STA, không cần gọi `esp_wifi_stop()` |

---

## 5. Task và luồng dữ liệu

| Task | Stack | Prio | Việc |
|------|-------|------|------|
| `mqtt` (esp-mqtt) | 6144 | 5 | Kết nối broker, nhận event |
| `mqtt_publish` | 6144 | 5 | Lấy tin khỏi hàng đợi phát → `esp_mqtt_client_publish` |
| `mqtt_inbound` | 6144 | 5 | Lấy tin khỏi hàng đợi nhận → gọi handler của `sm_app` |
| `telemetry` | 4096 | 4 | Đọc DHT11 theo chu kỳ, phát telemetry |
| `ota` | 8192 | 4 | Tải + ghi firmware, chỉ tồn tại trong lúc OTA |
| `wifi_retry` | 3072 | 3 | Backoff kết nối lại Wi-Fi (2 s → 60 s, nhân đôi) |

Hàng đợi: `SM_MQTT_QUEUE_LEN = 16`, payload tối đa `1024` byte, buffer esp-mqtt `1536` byte.

**Luồng phát (publish)** — không module nào gọi MQTT trực tiếp từ task riêng của nó:

```text
module gọi sm_mqtt_publish(topic, payload, qos, retain)
        ↓  copy chuỗi vào queue (nhanh, không chặn)
mqtt_publish task
        ↓
esp_mqtt_client_publish()
```

**Luồng nhận (inbound)**:

```text
broker → MQTT_EVENT_DATA (có thể nhiều chunk)
        ↓  ghép lại payload trong biến tĩnh
mqtt_inbound task → sm_mqtt inbound handler → on_inbound() (sm_app.c)
        ↓  phân nhánh theo hậu tố topic
   command → sm_command_handle()
   config  → sm_configuration_handle()
   ota     → sm_ota_handle()
```

Nhờ vậy task MQTT không bao giờ bị DHT11 hay OTA block, và ngược lại.

---

## 6. Muốn sửa gì thì xem file nào

| Việc cần làm | File cần sửa | Lưu ý |
|--------------|---------------|-------|
| Đổi GPIO, thêm/bớt relay | `main/Kconfig.projbuild` | Không sửa `.c`; `sm_hardware.c` tự đọc |
| Đổi Wi-Fi/MQTT/giá trị mặc định | `main/Kconfig.projbuild` | `sdkconfig` không commit |
| Đổi tên/mật khẩu AP cấu hình, cổng web | `main/Kconfig.projbuild` | `NODE_PROVISION_*` |
| Đổi giao diện/kiểm tra form cấu hình | `main/sm_provision/sm_provision.c` | HTML nằm trong hằng `PROV_PAGE_*` |
| Thêm trường vào form cấu hình | `sm_provision.c` + `sm_device.h` | Nhớ `html_escape()` khi in giá trị lại HTML |
| Đổi chu kỳ telemetry | `NODE_TELEMETRY_INTERVAL` hoặc message `config` | Runtime đọc lại qua `sm_node_config_get` |
| Bump version firmware | `NODE_FIRMWARE_VERSION` trong `Kconfig.projbuild` | `CMakeLists.txt` đọc cùng chỗ → image descriptor khớp |
| Đổi tên topic | **Không sửa** | `MQTT_SPEC.md` §14: phải sửa spec trước |
| Đổi payload telemetry/command/state | `sm_telemetry.c`, `sm_command.c`, `sm_state.c` | Bám `MQTT_SPEC.md` §6/§7/§8 |
| Đổi danh sách capability | `sm_capability.c` | Chỉ dùng code trong Capability Registry |
| Thêm command mới | `sm_command.c` + `sm_state.c` | Command sai phải **không** phát state |
| Đổi logic OTA | `sm_ota.c` | Cần `app_desc_t` + partition size |
| Sửa driver DHT11 | `sm_hardware/sm_dht11.c` | Toàn bộ hằng số timing ở đầu file |
| Thêm log | Bất kỳ `.c` nào, dùng `TAG` sẵn có | Log tiếng Việt, không thêm topic mới |

---

## 7. Cấu hình `Kconfig.projbuild`

| Symbol | Mặc định | Ý nghĩa |
|--------|-----------|---------|
| `NODE_DEVICE_ID` | `esp32-c3-001` | Phải khớp `devices.device_id` của Backend |
| `NODE_HOME_ID` | `home01` | |
| `NODE_ROOM_ID` | `livingroom` | `livingroom` / `bedroom` / `kitchen` |
| `NODE_FIRMWARE_VERSION` | `1.0.0` | Phát trong `capability` |
| `NODE_DHT11_ENABLED` | `y` | Node không cảm biến thì đặt `n` |
| `NODE_DHT11_GPIO` | `4` | DATA line, cần pull-up 4.7k–10k |
| `NODE_RELAY_COUNT` | `1` | `0`–`8` |
| `NODE_RELAY_1_GPIO` | `0` | Chỉ có hiệu lực khi count ≥ 1 |
| `NODE_RELAY_2_GPIO` | `1` | Chỉ có hiệu lực khi count = 2 |
| `NODE_RELAY_ACTIVE_HIGH` | `y` | Board relay 5V phổ biến là active-low → đặt `n` |
| `NODE_TELEMETRY_INTERVAL` | `30` | Giây |
| `NODE_WIFI_SSID` / `_PASSWORD` | rỗng | Rỗng = cấu hình Wi-Fi bằng điện thoại (mục 4b) |
| `NODE_PROVISION_ENABLED` | `y` | Bật AP cấu hình khi NVS chưa có Wi-Fi |
| `NODE_PROVISION_AP_PASSWORD` | `smarthome123` | Mật khẩu AP tạm; rỗng hoặc <8 ký tự → AP mở không mật khẩu |
| `NODE_PROVISION_PORT` | `80` | Cổng HTTP của trang cấu hình |
| `NODE_WIFI_RESET_BUTTON_ENABLED` | `y` | Bật giữ BOOT để xóa riêng Wi-Fi |
| `NODE_WIFI_RESET_BUTTON_GPIO` | `9` | BOOT ESP32-C3; không trùng GPIO phần cứng |
| `NODE_WIFI_RESET_HOLD_SECONDS` | `5` | Nhả BOOT sau ngưỡng này nhưng trước 15 giây để chỉ xóa Wi-Fi |
| `NODE_MQTT_BROKER_URI` | `mqtt://192.168.1.10:1883` | `mqtts://` sẽ dùng cert bundle |
| `NODE_MQTT_USERNAME` / `_PASSWORD` | rỗng | Không bắt buộc |
| `NODE_MQTT_KEEPALIVE` | `60` | |
| `NODE_SNTP_SERVER` | `pool.ntp.org` | Telemetry chỉ publish sau khi đồng hồ đồng bộ; nếu rỗng, không publish telemetry |
| `NODE_OTA_ALLOW_HTTP` | `n` | Chỉ bật trong mạng lab |

Toàn bộ nhóm này (identity, GPIO, broker) chỉ là **factory default cho lần boot đầu**. Sau khi
provisioning chạy một lần, mọi giá trị nằm trong `setup_blob` và Kconfig không còn được đọc
nữa. Đổi `NODE_DEVICE_ID` trong `menuconfig` sau khi đã flash sẽ **không** đổi identity —
phải `idf.py erase-flash` hoặc sửa lại từ web form.

---

## 8. Dữ liệu lưu trong NVS (namespace `node`)

| Key | Loại | Ghi khi nào |
|-----|------|-------------|
| `setup_blob` | blob (`sm_setup_t`) | Khi provisioning lưu, hoặc lần boot đầu dựng từ Kconfig |
| `device_id`, `home_id`, `room_id` | string | Mirror từ `setup_blob` (giữ tương thích firmware cũ) |
| `relay_state` | bitmap `uint32` | Sau **mỗi** lần đóng/cắt relay (bit 0 = relay_1) |
| `cfg_json` | string | Khi nhận config hợp lệ |
| `cfg_version` | `uint32` | Khi nhận config hợp lệ |
| `wifi_pass` | string | Khi điện thoại bấm "Lưu" trong trang cấu hình |
| `wifi_ssid` | string | Ngay sau `setup_blob` + `wifi_pass` — có key này là node "đã được cấu hình" |

`setup_blob` đóng gói identity, GPIO phần cứng và broker vào **một** giá trị NVS: đọc/ghi
theo cả khối nên không bị trường hợp phần cấu hình mới đến một nửa. Nó có trường `version`
(`SM_SETUP_VERSION`) để firmware sau phát hiện layout cũ và dựng lại từ Kconfig thay vì đọc
ra dữ liệu rác.

Nhờ `relay_state`, sau khi mất điện hoặc reboot node vẫn giữ đúng trạng thái relay trước đó và
`sm_relay_init()` bật lại relay đúng trạng thái đó — Backend không bị lệch.

Vì sao thứ tự `setup_blob` → `wifi_pass` → `wifi_ssid` quan trọng: sự tồn tại của `wifi_ssid`
là điều kiện duy nhất quyết định node có mở AP cấu hình hay không. Ghi SSID trước rồi mất
điện giữa chừng sẽ tạo node "đã cấu hình" nhưng không có mật khẩu → không bao giờ vào được
mạng; hoặc tệ hơn, nối được mạng thật nhưng vẫn giữ GPIO/broker cũ.

---

## 9. Driver DHT11 (`sm_hardware/sm_dht11.c`)

Vì sao tự viết: ESP-IDF không có driver DHT11 chính thức cho C3, và driver cũ của framework
Arduino không dùng được trong project này.

Các hằng số timing ở đầu file:

| Hằng số | Giá trị | Ý nghĩa |
|---------|---------|---------|
| `DHT_HOST_LOW_MS` | 20 ms | Host giữ bus thấp ≥18 ms để cảm biến nhận lệnh đọc |
| `DHT_RESPONSE_SETTLE_US` | 55 µs | Nhả DATA về input pull-up, chờ vào pha phản hồi LOW |
| `DHT_RESPONSE_TIMEOUT` | 150 µs | Chờ cảm biến trả lời |
| `DHT_PULSE_TIMEOUT` | 120 µs | Timeout mỗi mức xung mong đợi |
| `DHT_MIN_INTERVAL_MS` | 2000 ms | Khoảng cách tối thiểu giữa các lần thử, kể cả đọc lỗi |

Driver `level-sync-v2` kiểm tra pha phản hồi LOW/HIGH rồi ghi lại 40 cặp xung LOW/HIGH
trong vùng tới hạn ngắn. Bit được xác định bằng cách so sánh HIGH với LOW của cùng cặp;
giải mã và kiểm tra checksum thực hiện sau khi ra khỏi vùng tới hạn. Không đếm ba cạnh
một cách cố định vì cảm biến có thể đã bắt đầu phản hồi LOW khi host quan sát DATA.

Sau khi nạp, kiểm tra log `Driver DHT11 level-sync-v2 sẵn sàng trên GPIO4` (GPIO tùy cấu hình).
Nếu đọc lỗi, log ghi pha (`response-low`, `response-high`, `data-low`, `data-high`) và
vị trí bit. Lỗi checksum ghi thêm thời lượng bốn cặp xung đầu để chẩn đoán. Mẫu lỗi vẫn
bị bỏ qua, không gửi số đo giả. Build thành công chưa xác nhận đọc cảm biến thành công;
cần kiểm tra log telemetry thực tế sau khi flash.

---

## 10. Xử lý command (`sm_command.c`)

```text
broker gửi command
   ↓ parse JSON, bắt buộc có command_id
   ↓ command == "set_relay"?  nếu không → từ chối
   ↓ params.relay là số nguyên trong 1..2?  (1.5 hoặc 3 bị từ chối)
   ↓ params.state là boolean?
   ↓ sm_state_set_relay(): bật/tắt GPIO → đọc lại pin → lưu NVS
   ↓ publish state KÈM command_id (retained)
```

Nguyên tắc quan trọng: **command hỏng thì im lặng, không phát state sai**. Nếu phát state khi
chưa thay đổi gì, Backend có thể tưởng đã thành công và đánh dấu command là SUCCESS sai.

`state` sau command phải mang **đúng `command_id`** để Backend đối chiếu (`MQTT_SPEC.md` §13).

---

## 11. OTA (`sm_ota.c`)

```text
1. nhận {"job_id","firmware_version","firmware_url","checksum"}
2. từ chối nếu đang có job chạy, hoặc firmware_url không phải https
3. tạo task ota (chỉ 1 job tại một thời điểm)
4. esp_https_ota_begin → perform (ghi thẳng vào partition kế tiếp)
5. is_complete_data_received? đọc app descriptor, đối chiếu version (ghi log nếu lệch)
6. nếu có checksum: SHA-256 cả partition → lệch thì trả partition cũ, báo failed, KHÔNG restart
7. esp_https_ota_finish → đổi boot partition sang slot mới
8. phát status success, chờ 2 s cho queue gửi xong, restart
```

Hai điểm cần nhớ:

- **Checksum là SHA-256 của ảnh đã pad đúng kích thước slot (1536 KB)**, không phải của file
  `.bin` chưa pad — vì `esp_https_ota` ghi ảnh vào partition nên firmware chỉ có thể hash đúng
  vùng flash đó. Lệnh tính có trong `README.md` §5. Bỏ trống `checksum` → chỉ kiểm tra định
  dạng ảnh ESP.
- **Job struct do task sở hữu**: `sm_ota_handle()` cấp phát rồi chuyển quyền sang task, task
  `free()` trong nhánh kết thúc. Sửa nhánh `goto finished` mà quên free là rò rỉ bộ nhớ; free
  thêm ở phía gọi là use-after-free.

Chưa hỗ trợ rollback (cần bật `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` khi thiết kế bootloader),
nên firmware hỏng chỉ sống được tới lần flash UART kế tiếp.

---

## 12. Quy ước code

- Tiền tố mọi hàm/biến toàn cục: `sm_` hoặc `s_`.
- Mỗi module có 1 hằng `TAG` dùng cho toàn bộ log của module đó.
- **Log tiếng Việt, payload MQTT tiếng Anh** (payload là hợp đồng với Backend, không dịch).
- Không hardcode GPIO/identity/timing trong `.c` — mọi thứ từ Kconfig.
- Không được tạo topic mới ngoài `MQTT_SPEC.md` §2.
- Không gửi dữ liệu giả: DHT11 lỗi → bỏ qua chu kỳ đó, không gửi 0.
- Không giữ topic/state trong RAM như nguồn sự thật duy nhất — NVS mới là nguồn sự thật.

---

## 13. Gotcha đã gặp — đừng lặp lại

| Vấn đề | Nguyên nhân | Bài học |
|--------|-------------|---------|
| Crash/race ngay sau khi nhận OTA | free struct ngay sau `xTaskCreate` | Task sở hữu dữ liệu nó dùng |
| `SNTP` không khởi động | gọi trước `esp_netif_init` | Network API phải sau bước 7 |
| Telemetry có `0 °C` khi rút DHT11 | đọc lỗi vẫn phát giá trị mặc định | Bỏ qua chu kỳ lỗi |
| Relay tự bật sau reboot | khôi phục sai mức active | Luôn kiểm tra `NODE_RELAY_ACTIVE_HIGH` |
| Subscribe báo lỗi dù thành công | `esp_mqtt_client_subscribe_multiple` trả `msg_id` (int), không phải `esp_err_t` | Kiểm tra `< 0` |
| Crash ở `esp_flash_get_size()` | API đổi thành `esp_flash_get_physical_size(chip, &size)` | Đọc lại header ESP-IDF 5.5 |
| Component `esp_log` không tồn tại | tên component là `log` | Kiểm tra tên component trong `REQUIRES` |
| ESP32-C3 không boot | flash size/partition lệch | Cần 4 MB + partition table đúng |
| `Failed to resolve component 'sm_provision'` | thêm thư mục nhưng quên khai báo trong `NODE_MODULE_DIRS` | Mỗi component mới phải khai báo ở `CMakeLists.txt` gốc |
| `.ssid = "abc"` báo `-Wint-conversion` | trong `wifi_config_t`, `ssid`/`password` là **mảng** byte, không phải con trỏ char | Dùng `memcpy` + `strnlen`, không dùng designated initializer |
| Trang cấu hình trả về 404 / không vào được | `sm_provision` chưa thêm vào `REQUIRES` của `sm_app` | Kiểm tra đủ `REQUIRES` ở cả CMake gốc lẫn component dùng nó |
| Trang web trả về cụt chữ / server treo | buffer HTML nằm trên stack task HTTP | Nâng `config.stack_size` (đang 8192), buffer local phải < stack |
| `format-truncation` thành error | `-Werror` của ESP-IDF với `snprintf` vào buffer không đủ | Cỡ buffer theo **worst case** (đã escape + tên dài nhất), không cứ theo dữ liệu thực tế |

---

## 14. Trạng thái kiểm thử

| Hạng mục | Trạng thái |
|---------|-----------|
| `idf.py build` (0 error, 0 warning) | **PASS** |
| `esptool image_info` (checksum + hash hợp lệ) | **PASS** |
| Flash lên ESP32-C3 thật | **CHƯA CHẠY** — chưa có thiết bị |
| Mở AP cấu hình + web form trên điện thoại | **CHƯA CHẠY** |
| Kết nối EMQX thật | **CHƯA CHẠY** — chưa có broker |
| Đọc DHT11, đóng/cắt relay | **CHƯA CHẠY** |
| OTA end-to-end | **CHƯA CHẠY** |

Checklist 12 bước để verify trên thiết bị thật nằm ở `README.md` §8.

---

## 15. Mở rộng

**Thêm một node phần cứng mới**: không cần build riêng và không cần sửa code. Dùng lại đúng
binary này, mỗi board tự nhập GPIO riêng từ web form (thiếu relay → `relay_count = 0`;
thiếu cảm biến → bỏ chọn DHT11). `menuconfig` chỉ còn là mặc định cho lần boot đầu.

**Thêm một capability mới** (ví dụ cảm biến mới): cần cập nhật Capability Registry trong
`SYSTEM_SPEC.md` §6 trước, sau đó thêm vào `sm_capability.c` và một module đọc cảm biến tương ứng.

**Thêm command mới**: xử lý trong `sm_command.c`, và luôn phát state xác nhận kèm `command_id`.
Muốn trả lỗi cho Backend thì phải bổ sung vào `MQTT_SPEC.md` trước (hiện chưa có kênh báo lỗi
riêng cho command).
