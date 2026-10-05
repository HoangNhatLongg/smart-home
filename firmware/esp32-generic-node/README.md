# Generic ESP32-C3 Node Firmware

Firmware dùng chung cho mọi node phần cứng của dự án (DHT11 + 1–2 relay hoặc chỉ DHT11),
bám theo `docs/MQTT_SPEC.md` và `docs/SYSTEM_SPEC.md`.

> Người mới tiếp nhận codebase: đọc **[FIRMWARE_GUIDE.md](FIRMWARE_GUIDE.md)** trước — file này
> giải thích cấu trúc, luồng khởi động, luồng dữ liệu, và bảng "muốn sửa gì thì xem file nào".

| Hạng mục | Giá trị |
|----------|---------|
| Target | ESP32-C3 (RISC-V, 400 KB SRAM) |
| Framework | ESP-IDF **v5.5.5** |
| Partition | `nvs` + 2 OTA app slots (`1536K` mỗi slot) |
| App image | 637008 bytes → còn **60%** trống trong slot |
| Build | **PASS** (0 error, 0 warning) |
| Flash/test phần cứng | **CHƯA CHẠY** — chưa có board ESP32-C3 và broker EMQX |

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

**Cấu hình cho từng node** (theo `docs/SYSTEM_SPEC.md` §15):

| Node | Phòng | Thiết bị | `menuconfig` |
|------|-------|-----------|--------------|
| ESP32-C3-001 | Phòng khách | DHT11 + 1 relay | `NODE_DEVICE_ID=esp32-c3-001`, `NODE_ROOM_ID=livingroom`, `NODE_DHT11_ENABLED=y`, `NODE_RELAY_COUNT=1` |
| ESP32-C3-002 | Phòng ngủ | DHT11 + 1 relay | `NODE_DEVICE_ID=esp32-c3-002`, `NODE_ROOM_ID=bedroom`, `NODE_DHT11_ENABLED=y`, `NODE_RELAY_COUNT=1` |
| ESP32-C3-003 | Bếp | DHT11, không relay | `NODE_DEVICE_ID=esp32-c3-003`, `NODE_ROOM_ID=kitchen`, `NODE_DHT11_ENABLED=y`, `NODE_RELAY_COUNT=0` |
| ESP32-C3-004/005 | Dự phòng | Không cảm biến, không relay | `NODE_DHT11_ENABLED=n`, `NODE_RELAY_COUNT=0` |

Lưu ý: `NODE_RELAY_COUNT=2` vẫn được hỗ trợ (instance `relay_1`, `relay_2`) nhưng **không**
dùng cho 3 node trên — mỗi node chỉ có tối đa 1 relay. "Relay 2" trong SYSTEM_SPEC §15 là số
thứ tự relay trong cả ngôi nhà (đèn phòng ngủ), không phải relay thứ 2 trên cùng board; vì vậy
instance_code của ESP32-C3-002 vẫn là `relay_1`.

`sm_hw_init()` sẽ từ chối khởi động (log lỗi rõ ràng) nếu DHT11 và relay cùng dùng một GPIO.

## 2. Build / Flash / Monitor

```powershell
cd C:\CNTT\IOT\DoAn\smart-home\firmware\esp32-generic-node
. "C:\Espressif\frameworks\esp-idf-v5.5.5\export.ps1"

idf.py menuconfig     # Smart Home Node Configuration + Wi-Fi + MQTT
idf.py build
idf.py -p COMx flash monitor
```

Bắt buộc cấu hình trước khi flash (mặc định đang là giá trị minh họa):

- `NODE_DEVICE_ID` / `NODE_HOME_ID` / `NODE_ROOM_ID` (mặc định `esp32-c3-001` / `home01` /
  `livingroom` — khớp với topic ví dụ trong `MQTT_SPEC.md` §2)
- `NODE_WIFI_SSID`, `NODE_WIFI_PASSWORD`
- `NODE_MQTT_BROKER_URI` (mặc định `mqtt://192.168.1.10:1883` — sửa theo IP máy chạy backend)

`NODE_MQTT_PASSWORD` để trống nếu broker không yêu cầu xác thực. **Không** commit secret:
`sdkconfig` đã nằm trong `.gitignore`.

Version firmware lấy từ `NODE_FIRMWARE_VERSION` trong `main/Kconfig.projbuild`; `CMakeLists.txt`
đọc chính giá trị này nên ESP image descriptor và payload `capability` luôn khớp — chỉ cần
tăng version ở một chỗ.

## 3. Kiến trúc code

```
main/
├── app_main.c              entry point -> sm_app_start()
├── Kconfig.projbuild       toàn bộ cấu hình (không hardcode trong .c)
└── sm_*/                   mỗi thư mục là một ESP-IDF component
    ├── sm_device/          identity (NVS + fallback Kconfig), config/relay-state NVS, SNTP
    ├── sm_hardware/        DHT11 timing driver, relay driver + restore state từ NVS
    ├── sm_mqtt/            client, LWT, subscribe, publish queue, inbound queue
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
khi có IP) → SNTP (sau `esp_netif_init`) → telemetry task.

## 4. Topic & payload (theo `docs/MQTT_SPEC.md`)

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

## 5. OTA

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

## 6. Cấu hình NVS (namespace `node`)

| Key | Loại | Nội dung |
|-----|------|----------|
| `device_id`, `home_id`, `room_id` | string | identity, ghi 1 lần từ Kconfig khi flash lần đầu |
| `relay_state` | bitmap `uint32` | bit 0 = relay_1, bit 1 = relay_2 (ghi lại sau mỗi lần đóng/cắt) |
| `cfg_json` | string | JSON cấu hình đã áp dụng, khôi phục lại sau reboot |
| `cfg_version` | `uint32` | `config_version` của cấu hình đang áp dụng |

## 7. Kiểm thử

| Hạng mục | Trạng thái |
|---------|-----------|
| `idf.py build` (ESP32-C3, 0 error / 0 warning) | **PASS** |
| `esptool image_info` (checksum + validation hash hợp lệ) | **PASS** |
| Flash phần cứng thật | **CHƯA CHẠY** (không có board) |
| Kết nối EMQX thật | **CHƯA CHẠY** (không có broker) |
| Đo DHT11, đóng/cắt relay | **CHƯA CHẠY** |

Sau khi có thiết bị, quy trình kiểm chứng đề xuất:

1. `idf.py -p COMx flash monitor` → xác nhận log `Cấu hình phần cứng: …`,
   `Đã kết nối MQTT tới …`, `Đã đồng bộ thời gian hệ thống …`.
2. `mosquitto_sub -t 'smarthome/home01/livingroom/esp32-c3-001/#' -v` → thấy `availability`
   online, `capability`, `state` retained ngay khi kết nối.
3. Publish command đúng contract (`MQTT_SPEC.md` §8) → relay đóng, `state` trả về đúng
   `command_id`, nghe tiếp ngang sau khi restart:
   ```json
   {"command_id":"cmd-001","timestamp":"2026-10-05T08:00:00Z","command":"set_relay",
    "params":{"relay":1,"state":true}}
   ```
4. Kiểm tra `capability` của ESP32-C3-001 có đủ `temperature`, `humidity`, `relay` với
   `instance_code` `temperature` / `humidity` / `relay_1`; của ESP32-C3-003 chỉ có
   `temperature` + `humidity` (không `relay`).
5. Gắn nhiệt kế lên DHT11 → `telemetry` có `data.temperature` / `data.humidity` hợp lệ ~mỗi 30s.
6. Ngắt chân DHT11 → telemetry dừng (không gửi giá trị 0), các chức năng khác vẫn chạy.
7. Tắt broker → LWT phát `offline`; bật lại broker → `online` + `capability` + `state`.
8. Gửi config sai → nhận response `rejected` trên `config` retained.
9. Gửi OTA `checksum` sai → `failed`, không restart; gửi đúng → restart và lên version mới.
10. Gửi `params.relay = 1.5` hoặc `params.relay = 3` → phải bị từ chối, relay không đổi.

## 8. Điểm cần lưu ý / giới hạn

- **Mapping GPIO là giả định** (mục 1) — phải chỉnh theo board thật trước khi nối relay.
- `config` response dùng thêm `status: "rejected"` và `error` khi từ chối; `ota` status dùng
  `started` / `success` / `failed`. `MQTT_SPEC.md` chưa khóa 2 trường hợp này — nếu backend
  cần tên khác thì điều chỉnh ở `sm_configuration.c` / `sm_ota.c`.
- Chưa có cơ chế `command` trả lời lỗi riêng: command sai bị bỏ qua hoàn toàn theo spec
  (chỉ log cục bộ) để tránh rò rỉ trạng thái sai.
- Chưa hỗ trợ rollback OTA (ESP-IDF chỉ rollback khi bật `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`),
  nên firmware sai sẽ chỉ sống tới khi flash lại qua UART.
- OTA chạy bằng `esp_https_ota` nên image phải được build đúng partition table này.