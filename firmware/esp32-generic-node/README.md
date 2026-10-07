# Generic ESP32-C3 Node Firmware

Firmware dùng chung cho mọi node phần cứng của dự án (DHT11, tối đa 8 relay,
cảm biến đất và PIR),
bám theo `docs/MQTT_SPEC.md` và `docs/SYSTEM_SPEC.md`.

> Người mới tiếp nhận codebase: đọc **[FIRMWARE_GUIDE.md](FIRMWARE_GUIDE.md)** trước — file này
> giải thích cấu trúc, luồng khởi động, luồng dữ liệu, và bảng "muốn sửa gì thì xem file nào".

| Hạng mục | Giá trị |
|----------|---------|
| Target | ESP32-C3 (RISC-V, 400 KB SRAM) |
| Framework | ESP-IDF **v5.5.5** |
| Partition | `nvs` + 2 OTA app slots (`1536K` mỗi slot) |
| App image | 1069840 bytes → còn **32%** trống trong slot (HTTP server của provisioning chiếm phần lớn) |
| Build | `idf.py build` đạt ngày 07/10/2026 trên ESP-IDF v5.5.5 (incremental; chưa flash bản này) |
| Flash/test phần cứng | **Đã kiểm thử một phần** — Wi-Fi/MQTT, DHT11 và relay đã chạy với ESP32-C3; cảm biến đất và PIR chưa có phần cứng để test |

## 1. Yêu cầu phần cứng (giả định)

Repo chưa có bảng mapping GPIO chính thức, nên firmware dùng **giá trị mặc định có thể
đổi trong `menuconfig`**:

| Tín hiệu | GPIO mặc định | Ghi chú |
|----------|---------------|---------|
| DHT11 DATA | GPIO4 | Open-drain, có pull-up 4.7k–10k |
| Relay 1 (IN1) | GPIO0 | Active mặc định (HIGH = ON) |
| Relay 2 (IN2) | GPIO1 | Chỉ dùng khi `NODE_RELAY_COUNT = 2` |

Module relay điểm khiển cổng **active-low** của board relay 5V phổ biến, nên đổi
`NODE_RELAY_ACTIVE_HIGH` → `n` nếu module của bạn active-low.

**Ví dụ ánh xạ node cũ** (theo `docs/SYSTEM_SPEC.md` §15; không cần đặt Home/Room/Device ID
trong `menuconfig` cho quy trình ghép nối mới):

| Node | Phòng | Thiết bị | `menuconfig` |
|------|-------|-----------|--------------|
| ESP32-C3-001 | Phòng khách | DHT11 + 1 relay | `NODE_DEVICE_ID=esp32-c3-001`, `NODE_ROOM_ID=livingroom`, `NODE_DHT11_ENABLED=y`, `NODE_RELAY_COUNT=1` |
| ESP32-C3-002 | Phòng ngủ | DHT11 + 1 relay | `NODE_DEVICE_ID=esp32-c3-002`, `NODE_ROOM_ID=bedroom`, `NODE_DHT11_ENABLED=y`, `NODE_RELAY_COUNT=1` |
| ESP32-C3-003 | Bếp | DHT11, không relay | `NODE_DEVICE_ID=esp32-c3-003`, `NODE_ROOM_ID=kitchen`, `NODE_DHT11_ENABLED=y`, `NODE_RELAY_COUNT=0` |
| ESP32-C3-004/005 | Dự phòng | Không cảm biến, không relay | `NODE_DHT11_ENABLED=n`, `NODE_RELAY_COUNT=0` |

Firmware hỗ trợ tối đa 8 relay trên một node; số thực tế phụ thuộc GPIO được chọn
và các cảm biến đang dùng. Mỗi relay có instance riêng `relay_1` đến `relay_8`.

`sm_hw_init()` sẽ từ chối khởi động (log lỗi rõ ràng) nếu DHT11 và relay cùng dùng một GPIO.

## 2. Cấu hình thiết bị từ điện thoại (không cần sửa code)

Sau khi `flash`, node **không cần** biết trước Wi-Fi, mã thiết bị, chân GPIO hay địa chỉ
broker. Nếu NVS chưa có Wi-Fi nào, node tự bật một mạng Wi-Fi riêng và mở web form:

```text
1. Nối điện thoại vào Wi-Fi  SmartHomeNode-A1B2     (mật khẩu: smarthome123)
2. Mở trình duyệt          http://192.168.4.1
3. Chọn Wi-Fi gần đó, nhập mật khẩu, Backend URL và GPIO
4. Bấm "Lưu và kết nối", lưu mã ghép nối hiện trên trang
5. Sau khi ESP nối Wi-Fi, mở Dashboard → Thiết bị → Thêm thiết bị
6. Nhập mã, chọn nhà/phòng, đặt tên và MQTT URI mà ESP truy cập được
```

Một lần cấu hình là đủ cho cả đổi tên thiết bị lẫn đổi phần cứng — không phải build lại
firmware cho từng node.

Điện thoại thường tự hiện thông báo "Đăng nhập vào mạng" và mở trang cấu hình; nếu không thì
tự gõ `192.168.4.1`. Form được điền sẵn theo cấu hình đang lưu, nên khi cấu hình lại chỉ cần
sửa ô cần đổi.

### Nội dung form

| Nhóm | Trường |
|------|--------|
| Wi-Fi | Danh sách SSID quét được, ô nhập SSID thủ công, mật khẩu |
| Kết nối | Backend URL trên LAN, ví dụ `http://192.168.1.10:3001` |
| Phần cứng | bật/tắt DHT11, GPIO DHT11, số relay (0–8), GPIO từng relay, mức kích hoạt relay |

ESP sinh `device_id` từ MAC và lưu mã ghép nối + secret trong NVS. Sau khi Wi-Fi
hoạt động, ESP đăng ký tạm qua REST. Backend cấp Home/Room UUID và MQTT URI sau
khi chủ Home ghép nối trên Dashboard. ESP kiểm tra REST mỗi 10 giây để nhận
broker mới; thay đổi IP MQTT không cần reset Wi-Fi. Mã hết hạn sau 15 phút nếu
ESP ngừng đăng ký lại. Trang SoftAP không lưu mật khẩu Dashboard.

### Cấu hình phần cứng từ Dashboard

Sau khi ESP đã ghép nối và đang online, mở trang chi tiết thiết bị → **Phần
cứng và GPIO**. Một node có thể đồng thời dùng DHT11, tối đa tám relay, một
cảm biến độ ẩm đất analog và một PIR phát hiện chuyển động. Chọn đúng GPIO,
lưu, rồi ESP xác nhận cấu hình qua MQTT và tự khởi động lại. Capability mới sẽ
hiện sau khi node kết nối lại.

- GPIO digital khả dụng trong cấu hình: 0, 1, 3, 4, 5, 6, 7, 10, 11. Danh
  sách này loại bỏ chân BOOT/strap, USB, UART và flash của profile generic C3.
- Một GPIO chỉ gán cho một ngoại vi; cảm biến đất chỉ dùng GPIO0–GPIO4.

- Cảm biến độ ẩm đất chỉ dùng GPIO0, GPIO1, GPIO3 hoặc GPIO4 (ADC của ESP32-C3). Giá trị % là quy
  đổi mặc định; nên hiệu chuẩn theo cảm biến/đất thực tế trước khi dùng tưới tự động.
- PIR là đầu vào digital, dùng GPIO khác relay/cảm biến.
- Không dùng GPIO9 (BOOT), GPIO18 hoặc GPIO19 (USB); một GPIO không được gán cho
  hai thiết bị. ESP sẽ từ chối cấu hình sai ngay cả khi giao diện bị bỏ qua.

Tên AP lấy từ 2 byte cuối MAC nên mỗi board một tên riêng (`SmartHomeNode-A1B2`), tránh nhầm
khi cấu hình nhiều node.

| Kconfig | Mặc định | Ý nghĩa |
|---------|-----------|---------|
| `NODE_PROVISION_ENABLED` | `y` | Bật AP cấu hình khi NVS chưa có Wi-Fi |
| `NODE_PROVISION_AP_PASSWORD` | `smarthome123` | Mật khẩu của AP tạm (không phải Wi-Fi nhà) |
| `NODE_PROVISION_PORT` | `80` | Cổng web server |

Lưu ý:
- **Đổi Wi-Fi mà không xóa ghép nối/cấu hình phần cứng:** khởi động node bình thường, giữ
  nút **BOOT** ít nhất 5 giây rồi nhả trước 15 giây. Firmware chỉ xóa Wi-Fi, tự khởi động lại và mở SoftAP
  `SmartHomeNode-xxxx` tại `http://192.168.4.1`. Home/Room/Device ID, broker, GPIO, relay
  state và cấu hình MQTT vẫn được giữ. Trên ESP32-C3 phổ biến, BOOT là GPIO9; có thể đổi
  GPIO/thời gian giữ bằng `NODE_WIFI_RESET_*` trong menuconfig. GPIO nút này không được trùng
  chân relay hoặc cảm biến.
- **Đặt lại hoàn toàn:** giữ BOOT đủ 15 giây. Toàn bộ NVS (Wi-Fi, ghép nối, broker,
  cấu hình phần cứng và state đã lưu) bị xóa. Thiết bị mở SoftAP để cấu hình lại;
  nếu đã ghép nối trên Dashboard, cần xóa bản ghi thiết bị cũ trước khi ghép nối lại.
- **Bỏ ghép nối từ Dashboard:** vào Thiết bị → Bỏ ghép nối. Backend xóa thiết bị và dữ liệu
  phụ thuộc; ESP phát hiện secret bị thu hồi trong lần kiểm tra REST tiếp theo, xóa
  Home/Room/broker và mở SoftAP. Wi-Fi và GPIO cũ được giữ, nên chỉ cần lưu lại form
  để tạo mã ghép nối mới.
- Cấu hình nhập trên điện thoại được lưu ở NVS và **luôn thắng** giá trị `menuconfig`:
  - `wifi_ssid`, `wifi_pass` — Wi-Fi.
  - `setup_blob` — identity, GPIO, relay và broker (một blob, version `SM_SETUP_VERSION`).
  - Nếu `setup_blob` không tồn tại thì node dựng từ `menuconfig` một lần rồi lưu lại, nên
    các board đã flash trước đây vẫn giữ đúng `device_id`/`home_id`/`room_id` của mình.
- `setup_blob` được ghi **trước** `wifi_ssid`. Nếu ghi cấu hình thất bại, node vẫn mở lại AP ở
  lần boot sau thay vì kết nối mạng thật với cấu hình phần cứng cũ.
- Cùng một GPIO không thể dùng cho hai thiết bị; form báo lỗi ngay nếu DHT11 và relay trùng chân.
- Nếu `NODE_PROVISION_ENABLED = n` mà `NODE_WIFI_SSID` cũng rỗng thì node báo lỗi và không kết
  nối được — đây là cố ý để không im lặng khi cấu hình sai.
- Wi-Fi nhập qua điện thoại được gửi trong mạng AP không mã hóa, AP cũng tự tắt sau khi lưu nên
  chỉ dùng được trong mạng nội bộ tin cậy.

## 3. Build / Flash / Monitor

```powershell
cd C:\CNTT\IOT\DoAn\smart-home\firmware\esp32-generic-node
. "C:\Espressif\frameworks\esp-idf-v5.5.5\export.ps1"

idf.py menuconfig     # Smart Home Node Configuration + Wi-Fi + MQTT
idf.py build
idf.py -p COMx flash monitor
```

Cấu hình trước khi flash (mặc định đang là giá trị minh họa):

- `NODE_WIFI_SSID` / `NODE_WIFI_PASSWORD`: **để trống** để cấu hình mọi thứ từ điện thoại
  (xem §2). Giá trị này chỉ là fallback cho lần boot đầu.
- `NODE_DEVICE_ID` / `NODE_HOME_ID` / `NODE_ROOM_ID`, `NODE_MQTT_BROKER_URI`,
  `NODE_MQTT_USERNAME`, `NODE_MQTT_PASSWORD`, `NODE_DHT11_*`, `NODE_RELAY_*`:
  cũng chỉ là fallback/factory default — sau khi provisioning chạy một lần, NVS là nguồn duy nhất.

Nói cách khác: `menuconfig` **không còn bắt buộc** cho mỗi node. Build một binary, flash, rồi
cấu hình từng board trên web form.

`NODE_MQTT_PASSWORD` để trống nếu broker không yêu cầu xác thực. **Không** commit secret:
`sdkconfig` đã nằm trong `.gitignore`.

Version firmware lấy từ `NODE_FIRMWARE_VERSION` trong `main/Kconfig.projbuild`; `CMakeLists.txt`
đọc chính giá trị này nên ESP image descriptor và payload `capability` luôn khớp — chỉ cần
tăng version ở một chỗ.

## 4. Kiến trúc code

```
main/
├── app_main.c              entry point -> sm_app_start()
├── Kconfig.projbuild       toàn bộ cấu hình (không hardcode trong .c)
└── sm_*/                   mỗi thư mục là một ESP-IDF component
    ├── sm_device/          identity (NVS + fallback Kconfig), config/relay-state/Wi-Fi NVS, SNTP
    ├── sm_hardware/        DHT11 timing driver, relay driver + restore state từ NVS
    ├── sm_mqtt/            client, LWT, subscribe, publish queue, inbound queue
    ├── sm_provision/       SoftAP + web form cấu hình Wi-Fi từ điện thoại
    ├── sm_app/             điều phối + Wi-Fi STA
    ├── sm_telemetry/       task định kỳ (mặc định 30s)
    ├── sm_command/         set_relay
    ├── sm_state/           state retained + command_id
    ├── sm_configuration/   config/response
    ├── sm_availability/    online/offline
    ├── sm_capability/      khai báo năng lực
    └── sm_ota/             esp_https_ota
```

Tên thư mục có tiền tố `sm_` vì ESP-IDF đã có component `mqtt` sẵn (tránh trùng tên khi
ESP-IDF quét component trong `EXTRA_COMPONENT_DIRS`).

Thứ tự khởi động: NVS → identity → hardware → MQTT client → OTA → Wi-Fi (chỉ khởi động MQTT
khi có IP; nếu chưa có Wi-Fi thì mở AP cấu hình ở §2) → SNTP (sau `esp_netif_init`) → telemetry task.

## 5. Topic & payload (theo `docs/MQTT_SPEC.md`)

Base: `smarthome/{home_id}/{room_id}/{device_id}/...`

| Suffix | Chiều | QoS | Retain | Nội dung |
|--------|-------|-----|--------|----------|
| `telemetry` | node → backend | 0 | no | `{"timestamp":"…","data":{"temperature":…,"humidity":…}}` (chỉ khi có DHT11 và đọc OK) |
| `command` | backend → node | 1 | no | `{"command_id":"…","timestamp":"…","command":"set_relay","params":{"relay":1,"state":true}}` |
| `state` | node → backend | 1 | yes | `{"command_id":"…","timestamp":"…","state":{"relay_1":true}}` (`command_id` chỉ khi phản hồi command) |
| `availability` | both | 1 | yes | online: `{"status":"online","timestamp":"…"}` / LWT offline: `{"status":"offline"}` |
| `capability` | node → backend | 1 | yes | `{"device_id":"…","firmware_version":"1.0.0","capabilities":[{"capability_id":"temperature","instance_code":"temperature"},…,{"capability_id":"relay","instance_code":"relay_1"}]}` |
| `config` | backend → node + node → backend | 1 | yes | `{"config_version":3,"config":{…}}` → `{"config_version":3,"status":"applied","config":{…}}` |
| `ota` | backend → node + node → backend | 1 | no | `{"job_id":"ota-001","firmware_version":"1.1.0","firmware_url":"https://…","checksum":"…"}` và status `started` / `success` / `failed` |

Hành vi quan trọng:

- Khi mất mạng hoặc mất broker, node **không** ghi state giả — chỉ giữ state trong RAM và NVS.
- Command sai relay/sai kiểu dữ liệu bị từ chối **không** báo state (đúng tinh thần spec).
- `state` sau command mang đúng `command_id` để backend đối chiếu.
- Telemetry không gửi khi DHT11 lỗi (không gửi giá trị 0/null giả).
- Trạng thái relay khôi phục lại từ NVS sau reboot, nên backend luôn biết trạng thái thật.

## 6. OTA

```json
{
  "job_id": "ota-001",
  "firmware_version": "1.1.0",
  "firmware_url": "https://…/esp32-generic-node.bin",
  "checksum": "<sha256 hex>"
}
```

- OTA chạy nền, chỉ một job tại một thời điểm; job mới khi đang chạy sẽ bị từ chối.
- URL HTTP chỉ được phép khi bật `NODE_OTA_ALLOW_HTTP` (mặc định tắt); HTTPS dùng
  certificate bundle `esp_crt_bundle_attach` nên không cần user CA.
- `checksum` là **SHA-256 (hex) của 1536 KB đầu tiên của partition OTA đích**, tức ảnh đã
  được đệm (pad) đúng kích thước slot — không phải SHA-256 của file `.bin` chưa pad:

  ```powershell
  $slot = 0x180000
  Copy-Item build\esp32-generic-node.bin ota-padded.bin
  $fs = [IO.File]::OpenWrite("ota-padded.bin"); $fs.SetLength($slot); $fs.Close()
  (Get-FileHash ota-padded.bin -Algorithm SHA256).Hash.ToLower()
  ```

  Firmware so sánh không phân biệt hoa/thường, nhưng **không** chấp nhận tiền tố `sha256:`.
- Bỏ trống `checksum` → bỏ qua bước hash, chỉ kiểm tra định dạng/chữ ký ESP image.
- Sai checksum → **giữ nguyên firmware hiện tại**, đặt boot partition về slot cũ, báo
  `failed`, không restart.
- Thành công → đổi boot partition sang slot mới và restart.
- `NODE_OTA_MAX_IMAGE_BYTES` chặn ảnh vượt kích thước slot.

## 7. Cấu hình NVS (namespace `node`)

| Key | Loại | Nội dung |
|-----|------|----------|
| `device_id`, `home_id`, `room_id` | string | identity, ghi 1 lần từ Kconfig khi flash lần đầu |
| `relay_state` | bitmap `uint32` | bit N = relay_(N+1), tối đa 8 relay (ghi lại sau mỗi lần đóng/cắt) |
| `cfg_json` | string | JSON cấu hình đã áp dụng, khôi phục lại sau reboot |
| `cfg_version` | `uint32` | `config_version` của cấu hình đang áp dụng |
| `wifi_ssid`, `wifi_pass` | string | Wi-Fi nhập từ điện thoại (mục 2), ghi `wifi_pass` trước `wifi_ssid` |

`wifi_ssid` là dấu hiệu "node đã được cấu hình": khi key này còn trong NVS thì node nối
Wi-Fi thật và không mở AP cấu hình nữa. Vì vậy nếu Wi-Fi nhà đổi mật khẩu, phải xóa NVS
(`idf.py erase-flash`) hoặc tạo bản build với `NODE_WIFI_SSID` mới.

## 8. Kiểm thử

| Hạng mục | Trạng thái |
|---------|-----------|
| `idf.py build` (ESP32-C3, 0 error / 0 warning) | **PASS** |
| `esptool image_info` (checksum + validation hash hợp lệ) | **PASS** |
| Flash phần cứng thật | **PASS** trên ESP32-C3 |
| Mở AP cấu hình + web form trên điện thoại | **Đã kiểm thử** |
| Kết nối EMQX thật | **PASS** |
| Đo DHT11, đóng/cắt relay | **PASS** |
| Cảm biến độ ẩm đất / PIR | **CHƯA TEST** — chưa có module phần cứng |

Sau khi có thiết bị, quy trình kiểm chứng đề xuất:

1. `idf.py -p COMx flash monitor` (để trống `NODE_WIFI_SSID`) → log phải báo
   `chuyển sang chế độ cấu hình qua điện thoại` và `đã mở AP 'SmartHomeNode-XXXX'`.
2. Điện thoại vào AP đó, mở `http://192.168.4.1`, nhập SSID/mật khẩu sai một lần → phải hiện
   lỗi và **không** restart; nhập lại đúng → node restart.
3. Sau restart, log phải báo `Đang kết nối tới Wi-Fi SSID '…'` rồi `Đã kết nối MQTT tới …`;
   lần sau bật lại node **không** mở AP nữa (kiểm tra bằng cách tìm kiếm Wi-Fi trên điện thoại).
4. `mosquitto_sub -t 'smarthome/home01/livingroom/esp32-c3-001/#' -v` → thấy `availability`
   online, `capability`, `state` retained ngay khi kết nối.
5. Publish command đúng contract (`MQTT_SPEC.md` §8) → relay đóng, `state` trả về đúng
   `command_id`, nghe tiếp ngang sau khi restart:
   ```json
   {"command_id":"cmd-001","timestamp":"2026-10-05T08:00:00Z","command":"set_relay",
    "params":{"relay":1,"state":true}}
   ```
6. Kiểm tra `capability` của ESP32-C3-001 có đủ `temperature`, `humidity`, `relay` với
   `instance_code` `temperature` / `humidity` / `relay_1`; của ESP32-C3-003 chỉ có
   `temperature` + `humidity` (không `relay`).
7. Gắn nhiệt kế lên DHT11 → `telemetry` có `data.temperature` / `data.humidity` hợp lệ ~mỗi 30s.
8. Ngắt chân DHT11 → telemetry dừng (không gửi giá trị 0), các chức năng khác vẫn chạy.
9. Tắt broker → LWT phát `offline`; bật lại broker → `online` + `capability` + `state`.
10. Gửi config sai → nhận response `rejected` trên `config` retained.
11. Gửi OTA `checksum` sai → `failed`, không restart; gửi đúng → restart và lên version mới.
12. Gửi `params.relay = 1.5` hoặc `params.relay = 3` → phải bị từ chối, relay không đổi.

## 9. Điểm cần lưu ý / giới hạn

- Wi-Fi nhập qua điện thoại lưu trong NVS và **không mã hóa** trên đường truyền của AP tạm; AP cũng tự tắt sau khi lưu. Cần đổi Wi-Fi nhà thì xóa NVS rồi flash lại (mục 2).
- **Mapping GPIO là giả định** (mục 1) — phải chỉnh theo board thật trước khi nối relay.
- `config` response dùng thêm `status: "rejected"` và `error` khi từ chối; `ota` status dùng
  `started` / `success` / `failed`. `MQTT_SPEC.md` chưa khóa 2 trường hợp này — nếu backend
  cần tên khác thì điều chỉnh ở `sm_configuration.c` / `sm_ota.c`.
- Chưa có cơ chế `command` trả lời lỗi riêng: command sai bị bỏ qua hoàn toàn theo spec
  (chỉ log cục bộ) để tránh rò rỉ trạng thái sai.
- Chưa hỗ trợ rollback OTA (ESP-IDF chỉ rollback khi bật `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`),
  nên firmware sai sẽ chỉ sống tới khi flash lại qua UART.
- OTA chạy bằng `esp_https_ota` nên image phải được build đúng partition table này.
