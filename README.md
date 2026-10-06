# Smart Home IoT

Hệ thống gồm Dashboard web, Backend, PostgreSQL, EMQX và firmware Generic Node
cho ESP32-C3. Một ESP32 có thể là node trung gian cho DHT11, nhiều relay, cảm
biến độ ẩm đất và PIR.

> Tài liệu này dùng để chạy hệ thống, kiểm thử và làm nội dung báo cáo. Xem
> thư mục docs/ để đọc các contract đầy đủ.

## Trạng thái kiểm thử

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| Wi-Fi, EMQX, Backend | Đã kiểm thử | ESP32-C3 đã kết nối broker và gửi MQTT. |
| DHT11 | Đã kiểm thử phần cứng | Dashboard đã nhận nhiệt độ và độ ẩm thực tế. |
| Relay | Đã kiểm thử phần cứng | Dashboard điều khiển được và ESP trả State xác nhận. |
| Cảm biến độ ẩm đất | Chưa kiểm thử phần cứng | Code, registry và cấu hình GPIO đã sẵn sàng; chưa có mạch để thử. |
| PIR/chuyển động | Chưa kiểm thử phần cứng | Đã có hướng mở rộng trong Generic Node. |
| OTA, Automation, Voice | Chưa xác nhận end-to-end | Cần test riêng trước khi demo. |

## Kiến trúc hệ thống

    Người dùng
        │
        ▼
    Frontend Dashboard (Next.js)
        │ REST API
        ▼
    Backend (Next.js + Node.js + MQTT.js) ─── PostgreSQL (Prisma)
        │ MQTT
        ▼
    EMQX Broker
        │
        ▼
    ESP32-C3 Generic Node ── DHT11 / Relay 1..8 / Soil sensor / PIR

Luồng chính:

1. Người dùng đăng nhập Dashboard, tạo Home và Room, rồi ghép ESP vào Room.
2. Backend lưu nghiệp vụ vào PostgreSQL, đồng thời kiểm tra quyền sở hữu Home.
3. Backend và ESP32 cùng kết nối EMQX; Frontend không giao tiếp MQTT trực tiếp.
4. ESP32 gửi availability, capability, state và telemetry qua MQTT.
5. Dashboard điều khiển relay qua Backend. Backend chỉ báo thành công sau khi
   nhận State có cùng command_id từ ESP32.

Mô hình tài nguyên:

    User
     └── Home
          └── Room
               └── Device (ESP32 node)
                    ├── Device capabilities
                    ├── Configuration
                    ├── Telemetry
                    ├── Current state / state history
                    └── Commands

Room.name là tên người dùng tự đặt, ví dụ Phòng ngủ 1. category là loại cố định
như bedroom hoặc living_room. floor giúp phân biệt các phòng trùng tên ở các
tầng khác nhau.

## Thành phần và trách nhiệm

| Thành phần | Công nghệ | Trách nhiệm |
| --- | --- | --- |
| Frontend | Next.js, React | Dashboard, đăng nhập, quản lý Home/Room/Device, cấu hình GPIO và điều khiển relay. |
| Backend | Next.js Route Handlers, Node.js, MQTT.js | REST API, xác thực, quyền Home, MQTT, retry, state/telemetry/configuration. |
| Database | PostgreSQL, Prisma | Dữ liệu nghiệp vụ, telemetry JSONB, state history, command và pairing. |
| MQTT Broker | EMQX | Trung tâm trao đổi bản tin Backend–ESP32. |
| Firmware | ESP-IDF v5.5.5, ESP32-C3 | Wi-Fi, provisioning, MQTT/LWT, DHT11, relay, runtime config và NVS. |

## Cơ sở dữ liệu

| Bảng | Mục đích |
| --- | --- |
| users | Tài khoản; password chỉ lưu dạng hash. |
| homes, rooms, devices | Cây User → Home → Room → ESP32 node. |
| device_pairings | Pairing code một lần, device secret và MQTT URI. |
| capability_registry, device_capabilities | Danh mục chức năng và chức năng từng node. |
| device_configurations | desired_config, applied_config, config_version. |
| telemetry | Dữ liệu đo JSONB, có recorded_at. |
| device_states, state_history | Trạng thái hiện tại và lịch sử thay đổi. |
| commands | Command, retry, thời điểm gửi/xong và lỗi. |
| automation_rules, automation_logs | Dữ liệu tự động hóa. |
| firmware_versions, ota_jobs | Version firmware và phiên OTA. |

Quan hệ cốt lõi:

    users ──< homes ──< rooms ──< devices
                                   ├──< device_capabilities >── capability_registry
                                   ├──  device_configurations
                                   ├──< telemetry
                                   ├──< device_states
                                   ├──< state_history
                                   └──< commands

Telemetry lưu JSONB để Generic Node có thể gửi nhiều loại số đo trong một mẫu,
không cần thay đổi schema cho từng cảm biến.

## MQTT: topic, QoS và payload

Namespace duy nhất:

    smarthome/{home_id}/{room_id}/{device_id}/{suffix}

home_id và room_id là UUID trong Backend; device_id là mã logic của node, ví dụ
esp32-c3-3c0f02a2e348.

| Suffix | Hướng | QoS | Retain | Mục đích |
| --- | --- | ---: | --- | --- |
| telemetry | ESP32 → Backend | 0 | Không | Nhiệt độ, độ ẩm và số đo cảm biến. |
| state | ESP32 → Backend | 1 | Có | Trạng thái relay, xác nhận command bằng command_id. |
| command | Backend → ESP32 | 1 | Không | Lệnh bật/tắt relay. |
| availability | ESP32 → Backend | 1 | Có | online/offline; offline do LWT phát khi mất kết nối. |
| config | Hai chiều | 1 | Có | Desired configuration và applied configuration. |
| capability | ESP32 → Backend | 1 | Có | Khai báo chức năng node hỗ trợ. |
| ota | Hai chiều | 1 | Không | Yêu cầu và trạng thái cập nhật firmware. |

Telemetry mẫu:

    {
      "timestamp": "2026-10-06T13:34:24Z",
      "data": { "temperature": 34, "humidity": 66.1 }
    }

Command và State xác nhận:

    {
      "command_id": "<uuid-command>",
      "timestamp": "2026-10-06T13:35:00Z",
      "command": "set_relay",
      "params": { "relay": 1, "state": true }
    }

    {
      "command_id": "<uuid-command>",
      "timestamp": "2026-10-06T13:35:01Z",
      "state": { "relay_1": true }
    }

Publish thành công chỉ xác nhận EMQX đã nhận gói tin. Command chỉ SUCCESS khi
Backend nhận State đúng trạng thái và cùng command_id.

## Ghép nối và cấu hình ESP32

1. Flash Generic Node vào ESP32-C3.
2. Khi chưa có Wi-Fi, ESP mở SoftAP SmartHomeNode-XXXX (mật khẩu mặc định
   smarthome123). Kết nối điện thoại vào AP và mở http://192.168.4.1.
3. Chọn Wi-Fi, nhập Backend URL theo IP LAN, ví dụ http://192.168.1.170:3001,
   và chọn GPIO phần cứng ban đầu.
4. ESP đăng ký pairing tạm thời. Trên Dashboard chọn **Thiết bị → Thêm thiết bị**,
   nhập pairing code, chọn Home/Room, đặt tên node và MQTT URI, ví dụ
   mqtt://192.168.1.170:1883. Không dùng localhost hoặc IP Docker nội bộ.
5. Backend trả Home/Room/MQTT qua Bootstrap REST bằng device secret. ESP lưu
   NVS, khởi động MQTT, phát availability, capability và state.

Đổi Wi-Fi: giữ BOOT ít nhất 5 giây. Đổi broker: sửa MQTT URI trên Dashboard;
ESP lấy broker mới mà không cần reset Wi-Fi. Giữ BOOT 15 giây để xóa toàn bộ NVS.

Dashboard có thể gửi hardware config qua topic config: DHT11, tối đa 8 relay,
một cảm biến đất analog và một PIR digital. Một GPIO chỉ được gán một ngoại vi.
GPIO digital hợp lệ của profile C3: 0, 1, 3, 4, 5, 6, 7, 10, 11; cảm biến đất
chỉ dùng ADC GPIO 0, 1, 3, 4. Không dùng GPIO 9 (BOOT), GPIO 18/19 (USB), GPIO
20/21 (UART console).

Relay có metadata: tên hiển thị, loại (light, pump, fan, socket, curtain,
other) và mô tả. Người dùng thấy “Đèn phòng khách”, nhưng MQTT giữ mã ổn định
relay_1.

## Chạy project local

### PostgreSQL và EMQX

    cd C:\CNTT\IOT\DoAn\smart-home
    docker compose -f docker\docker-compose.yml up -d

- PostgreSQL: localhost:5432
- MQTT TCP: localhost:1883
- EMQX Dashboard: http://localhost:18083

Tài khoản EMQX phụ thuộc image/cấu hình container đang chạy; kiểm tra trực tiếp
cấu hình EMQX thay vì đưa credential demo vào mã nguồn.

### Backend

    cd C:\CNTT\IOT\DoAn\smart-home\backend
    Copy-Item .env.example .env
    npm install
    npm run db:migrate -- --name init
    npm run db:seed
    npm run dev -- --port 3001

Sửa .env để DATABASE_URL, MQTT_URL và AUTH_SECRET phù hợp. Backend local dùng
mqtt://localhost:1883, còn ESP phải dùng IP LAN của máy.

Seed local tạo user@example.com / ChangeMe123! nếu chưa đặt SEED_USER_EMAIL và
SEED_USER_PASSWORD. Chỉ dùng cho demo local.

### Frontend

    cd C:\CNTT\IOT\DoAn\smart-home\frontend
    npm install
    npm run dev

Mở URL do terminal in ra, thường là http://localhost:3000.

### Firmware

    cd C:\CNTT\IOT\DoAn\smart-home\firmware\esp32-generic-node
    . "C:\Espressif\frameworks\esp-idf-v5.5.5\export.ps1"
    idf.py build
    idf.py -p COMx flash monitor

Xem chi tiết firmware tại firmware/esp32-generic-node/FIRMWARE_GUIDE.md.

## REST API quan trọng

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| POST | /api/auth/login | Đăng nhập; chỉ nhận POST. |
| POST | /api/auth/logout | Đăng xuất. |
| GET | /api/auth/me | User hiện tại. |
| GET, POST | /api/homes | Danh sách/tạo Home. |
| GET, PUT, DELETE | /api/homes/:homeId | Xem/sửa/xóa Home. |
| GET, POST | /api/homes/:homeId/rooms | Danh sách/tạo Room thuộc Home. |
| PUT, DELETE | /api/rooms/:roomId | Sửa/xóa Room. |
| POST | /api/devices/pair | Gán ESP đã có pairing code vào Room. |
| GET, PUT | /api/devices/:deviceId | Chi tiết/sửa node. |
| GET, PUT | /api/devices/:deviceId/configuration | Đọc/gửi cấu hình hardware và metadata relay. |
| POST | /api/devices/:deviceId/commands | Tạo command relay. |
| GET | /api/devices/:deviceId/telemetry | Lịch sử telemetry. |
| GET | /api/devices/:deviceId/state | Current state. |
| GET | /api/devices/:deviceId/state-history | State history. |
| GET | /api/commands/:commandId | Trạng thái command. |
| POST | /api/provisioning/register | ESP đăng ký pairing tạm thời. |
| POST | /api/provisioning/bootstrap | ESP lấy Home/Room/MQTT bằng secret. |

Mở /api/auth/login trên thanh địa chỉ gửi HTTP GET nên nhận 405 Method Not
Allowed là đúng. Test login bằng POST:

    $baseUrl = 'http://localhost:3001'
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"email":"user@example.com","password":"ChangeMe123!"}' -WebSession $session

Không đặt tên biến PowerShell là $home: đó là biến hệ thống chỉ đọc. Dùng
$createdHome thay thế.

## Kịch bản kiểm thử demo

1. Chạy Docker, Backend và Frontend; đăng nhập và tạo Home/Room.
2. Ghép ESP bằng pairing code. Dashboard phải thấy node online và capability.
3. Bật DHT11 đúng GPIO, lưu cấu hình, đợi ESP báo applied và kết nối lại.
4. Chờ telemetry. Dashboard phải dùng mẫu mới nhất; DHT11 lỗi không gửi số 0 giả.
5. Cấu hình relay, đặt tên “Đèn phòng khách”; bấm bật/tắt. UI chỉ kết thúc chờ
   khi ESP publish State có cùng command_id.
6. Trong EMQX, subscribe smarthome/# để quan sát tin mới. Telemetry không
   retained nên subscription là cách tin cậy để theo dõi.
7. Chỉ test cảm biến đất/PIR khi có phần cứng; hiệu chuẩn ADC trước khi dùng tưới tự động.

## Dàn ý báo cáo đề xuất

1. **Bài toán và mục tiêu:** giám sát/điều khiển thời gian thực, mở rộng nhiều
   ngoại vi trên một ESP32.
2. **Kiến trúc:** sơ đồ mục Kiến trúc hệ thống; lý do dùng central broker EMQX.
3. **Thiết kế dữ liệu:** User–Home–Room–Device, Capability Registry, JSONB
   telemetry, current state và state history.
4. **MQTT:** topic, QoS, retain, LWT và command_id.
5. **Độ tin cậy:** Dashboard → Backend → MQTT → ESP32 → State → Backend;
   publish MQTT không có nghĩa relay đã hoạt động.
6. **Generic Node:** GPIO runtime, NVS, SoftAP provisioning, device secret và
   một ESP điều khiển nhiều ngoại vi.
7. **Bảo mật cơ bản:** password hash, session, quyền sở hữu Home, secret thiết bị.
8. **Kết quả/giới hạn:** DHT11 và relay đã test thực tế; cảm biến đất/PIR chưa có
   phần cứng; OTA/Automation/Voice cần test end-to-end riêng.
9. **Hướng phát triển:** hiệu chuẩn cảm biến đất, test PIR/OTA, automation,
   HTTPS ngoài LAN và biểu đồ lịch sử chuyên sâu.

## Tài liệu liên quan

- [SYSTEM_SPEC.md](docs/SYSTEM_SPEC.md): phạm vi và kiến trúc contract.
- [DATABASE_SPEC.md](docs/DATABASE_SPEC.md): database contract.
- [API_SPEC.md](docs/API_SPEC.md): REST API contract.
- [MQTT_SPEC.md](docs/MQTT_SPEC.md): MQTT topic/payload contract.
- [BACKEND_GUIDE.md](backend/BACKEND_GUIDE.md): hướng dẫn Backend.
- [FIRMWARE_GUIDE.md](firmware/esp32-generic-node/FIRMWARE_GUIDE.md): firmware và debug.
