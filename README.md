# Smart Home IoT

Hệ thống gồm Dashboard web, Backend, PostgreSQL, EMQX và firmware Generic Node
cho ESP32-C3. Một ESP32 có thể là node trung gian cho DHT11, nhiều relay, cảm
biến độ ẩm đất và PIR.

> Tài liệu này dùng để chạy hệ thống, kiểm thử và làm nội dung báo cáo. Contract
> chính thức nằm trong `docs/`; không dùng ví dụ trong README để thay đổi API
> hay MQTT. Các trạng thái kiểm thử bên dưới phản ánh những gì đã quan sát được,
> không đồng nghĩa mọi chức năng đã hoàn thành end-to-end.

## Trạng thái kiểm thử

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| Wi-Fi, EMQX, Backend | Đã kiểm thử kết nối | ESP32-C3 đã kết nối broker và gửi MQTT; trạng thái online còn phụ thuộc timestamp hợp lệ. |
| DHT11 | Đã kiểm thử phần cứng | Dashboard đã nhận nhiệt độ và độ ẩm thực tế. |
| Relay | Đã kiểm thử phần cứng | Dashboard điều khiển được và ESP trả State xác nhận. |
| Cảm biến độ ẩm đất | Chưa kiểm thử phần cứng | Code, registry và cấu hình GPIO đã sẵn sàng; chưa có mạch để thử. |
| PIR/chuyển động | Chưa kiểm thử phần cứng | Đã có hướng mở rộng trong Generic Node. |
| Build và test source | Đã chạy ngày 07/10/2026 | Firmware `idf.py build` đạt (incremental); Backend `tsc` và 3 test voice đạt; Frontend typecheck và 84 test đạt. Chưa thay cho test end-to-end. |
| Automation | Đã triển khai; chưa test đầy đủ với phần cứng | Có lịch hằng ngày, giờ tắt/hẹn tắt và rule độ ẩm đất thấp cho relay `pump`; dùng chung Command Service. |
| Voice Web | Đã kiểm thử phân loại câu mẫu; chưa xác nhận âm thanh Việt trên máy này | Ollama cục bộ hiểu ý định; trình duyệt cần giọng TTS tiếng Việt được cài riêng. Xem [hướng dẫn Voice](docs/VOICE_INTEGRATION.md). |
| Xiaozhi | Đã tích hợp API; chưa xác nhận đầy đủ với robot thật | Robot dùng token riêng và gọi Backend; model hội thoại trên robot do hệ thống Xiaozhi cấu hình. |
| Availability sau Backend restart | Đã triển khai; cần kiểm thử lại khi ESP đồng bộ giờ | Backend bỏ heartbeat có timestamp `1970`; ESP cần SNTP để được công nhận online. |
| OTA | Chưa xác nhận end-to-end | Cần test riêng trước khi demo. |

## Kiến trúc hệ thống

    Người dùng
        │
        ▼
    Frontend Dashboard (Next.js)
        │ REST API
        ▼
    Backend (Next.js + Node.js + MQTT.js) ─── PostgreSQL (Prisma)
        │
        ├── Ollama cục bộ (chỉ phân loại lời nói từ Web)
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
6. Scheduler và Voice đều đi qua Command Service; Ollama không truy cập MQTT,
   PostgreSQL hay GPIO trực tiếp.

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

`automation_rules.schedule` và `automation_rules.action` là JSONB, hỗ trợ
`daily` + `HH:mm`, `offAfterMinutes` hoặc `offTime`; điều kiện
`soil_moisture_below` dùng `threshold` và `cooldownMinutes`. Rule tưới theo
cảm biến chỉ được chọn relay có metadata `kind: "pump"`. Đây là dữ liệu cấu hình
quy tắc, không phải một dịch vụ hàng đợi riêng.

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

ESP phát `online` định kỳ (mặc định 30 giây). Backend chỉ chấp nhận timestamp
gần thời gian hiện tại, nên heartbeat `1970-01-01...` phát trước khi ESP đồng
bộ SNTP **không** làm thiết bị online. Backend cũng chuyển trạng thái online cũ
về offline khi khởi động và đánh dấu offline nếu quá hạn `last_seen_at`. Nếu
log báo MQTT đã kết nối nhưng Dashboard vẫn offline, hãy đợi log ESP
`Đã đồng bộ thời gian hệ thống`, kiểm tra heartbeat mới và log Backend
`Ignoring stale retained online availability`.

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
    npx prisma migrate deploy
    npm run db:seed
    npm run dev -- --port 3001

Sửa .env để DATABASE_URL, MQTT_URL và AUTH_SECRET phù hợp. Backend local dùng
mqtt://localhost:1883, còn ESP phải dùng IP LAN của máy.
Không chép đè `.env` đang có dữ liệu thật; lệnh `Copy-Item` chỉ dành cho lần
cài đầu. `.env` chứa secret và không được commit. Backend cũng có thể dùng
`VOICE_PROVIDER=ollama`, `OLLAMA_URL=http://127.0.0.1:11434`,
`OLLAMA_MODEL=qwen2.5:1.5b-instruct`; xem phần Voice bên dưới.

Seed local tạo user@example.com / ChangeMe123! nếu chưa đặt SEED_USER_EMAIL và
SEED_USER_PASSWORD. Chỉ dùng cho demo local.

### Frontend

    cd C:\CNTT\IOT\DoAn\smart-home\frontend
    npm install
    npm run dev

Mở URL do terminal in ra, thường là http://localhost:3000.
Trong `frontend/.env.local`, đặt `NEXT_PUBLIC_API_MODE=real` và
`BACKEND_URL=http://localhost:3001` để dùng Backend thật. Đổi `BACKEND_URL`
theo nơi Backend chạy rồi khởi động lại Frontend. Chế độ `mock` chỉ là dữ liệu
demo, không điều khiển ESP.

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
| GET, POST | /api/homes/:homeId/automations | Xem/tạo rule tự động hóa. |
| PUT, DELETE | /api/automations/:id | Sửa/xóa rule. |
| GET | /api/automations/:id/logs | Lịch sử chạy rule. |
| GET | /api/firmware | Firmware khả dụng. |
| GET, POST | /api/devices/:deviceId/ota | OTA của node/tạo OTA job. |
| GET | /api/ota/:jobId | Trạng thái OTA job. |
| POST | /api/voice/command | Lệnh/hỏi số đo từ Web, dùng session. |
| POST | /api/voice/xiaozhi | Lệnh/hỏi số đo từ robot, dùng Bearer token riêng. |
| POST | /api/provisioning/register | ESP đăng ký pairing tạm thời. |
| POST | /api/provisioning/bootstrap | ESP lấy Home/Room/MQTT bằng secret. |

Mở /api/auth/login trên thanh địa chỉ gửi HTTP GET nên nhận 405 Method Not
Allowed là đúng. Test login bằng POST:

    $baseUrl = 'http://localhost:3001'
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"email":"user@example.com","password":"ChangeMe123!"}' -WebSession $session

Không đặt tên biến PowerShell là $home: đó là biến hệ thống chỉ đọc. Dùng
$createdHome thay thế.

## Sử dụng Automation

Vào Dashboard → **Tự động hóa** → tạo rule và chọn đúng Home, node, relay đã
cấu hình. Loại `daily` chạy vào giờ `HH:mm` theo `AUTOMATION_TIMEZONE` (mặc định
`Asia/Ho_Chi_Minh`). Khi bật relay, có thể chọn **tắt sau N phút** hoặc **tắt
vào HH:mm**; không chọn đồng thời cả hai. Rule `soil_moisture_below` đọc mẫu
`soil_moisture` mới, so với ngưỡng %, kiểm tra cooldown rồi điều khiển relay
được gắn `kind: pump`. Nếu chưa có cảm biến đất, chỉ kiểm thử giao diện/API,
không kết luận tưới theo cảm biến đã hoạt động ngoài thực tế.

Backend Scheduler gọi cùng pipeline như nút điều khiển trên Dashboard:

    Rule đến giờ/đạt ngưỡng → Command Service → MQTT command → ESP32
                          → MQTT state cùng command_id → Command SUCCESS

Khi thiết bị offline, lệnh không được gửi tiếp; xem `automation_logs` để biết
lần chạy nào thất bại. Rule không tự phát MQTT riêng.

## Sử dụng giọng nói, Ollama và robot

Web Dashboard → **Trợ lý giọng nói**: gõ câu hoặc bấm **Nói**. Trình duyệt
chuyển giọng nói thành văn bản (`vi-VN`), Backend gửi câu văn bản tới Ollama
chạy local để phân loại `CONTROL_DEVICE` hoặc `QUERY_ENVIRONMENT`. Model chỉ
được chọn ID phòng/relay từ Home đã xác thực; Backend kiểm tra lại mục tiêu và
quyền rồi mới thực hiện. Ollama không "học" tự động và không gửi MQTT trực tiếp.

Để chạy trên máy Backend:

    ollama pull qwen2.5:1.5b-instruct

Trong `backend/.env`: `VOICE_PROVIDER=ollama`, `OLLAMA_URL` và `OLLAMA_MODEL`
phải trỏ tới service/model đã có. Khởi động lại Backend sau khi sửa `.env`.
Nếu Ollama không phản hồi, Web báo lỗi và **không gửi lệnh đoán**. Xiaozhi
`custom-robot` dùng endpoint riêng với robot token và Home UUID được cấu hình
trên Backend; phiên bản hiện tại của robot vẫn dùng bộ nhận diện quy tắc do
timeout HTTP 25 giây. Source robot nằm ở project Xiaozhi riêng, không thuộc
repository này.

Ô **Đọc câu trả lời bằng tiếng Việt** dùng TTS của trình duyệt, không phải
Ollama. Chỉ chọn giọng có locale `vi-VN`/`vi`; nếu máy thiếu giọng Việt, nút
**Thử giọng** báo lỗi và trang không chuyển sang giọng Anh. Trên Windows, cài
Tiếng Việt kèm tính năng Chuyển văn bản thành giọng nói trong Cài đặt → Thời
gian & ngôn ngữ → Ngôn ngữ & khu vực, rồi khởi động lại trình duyệt. Chưa xác
nhận âm thanh Việt trên máy thử hiện tại vì máy mới có giọng Anh.

Xem [VOICE_INTEGRATION.md](docs/VOICE_INTEGRATION.md) để cấu hình robot token,
thử câu nói, kiểm tra trường hợp mơ hồ và dữ liệu cảm biến quá 5 phút.

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
8. Tạo rule daily bật relay rồi tắt sau 1 phút; so sánh `automation_logs`,
   `commands` và State thật. Chưa có kết quả end-to-end cho kịch bản này.
9. Gõ `Cho đèn phòng khách sáng lên` và `Bật đèn` khi có hai đèn. Câu mơ hồ
   không được tạo Command. Dùng **Thử giọng** để tách lỗi TTS khỏi lỗi AI.
10. Khởi động lại Backend khi ESP vẫn chạy, rồi tắt ESP; kiểm tra heartbeat
    có timestamp thật và node không còn bị hiển thị online sai.

Các lệnh kiểm tra source (chạy độc lập ở từng thư mục):

    cd backend
    npx tsc --noEmit
    npx tsx --test tests/voice-ollama.test.ts
    cd ..\frontend
    npm run typecheck
    npm test

Build, unit test, API test và demo với phần cứng là các mức kiểm tra khác nhau;
chỉ ghi “đã thử thực tế” trong báo cáo khi có log/ảnh/State quan sát được.

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
8. **Automation:** mô hình daily, giờ tắt/hẹn tắt, điều kiện độ ẩm đất,
   cooldown, `pump` metadata và `automation_logs`; nêu rõ phần nào chưa có
   bằng chứng phần cứng.
9. **Voice:** Web Speech API cho STT/TTS, Ollama local để phân loại intent,
   validate ID/phân quyền, lệnh chung Command Service; Xiaozhi dùng Bearer
   token riêng. Phân biệt AI xử lý văn bản và giọng TTS của hệ điều hành.
10. **Kết quả/giới hạn:** DHT11 và relay đã test thực tế; cảm biến đất/PIR
    chưa có phần cứng; Automation/OTA/Xiaozhi và TTS Việt cần test end-to-end
    riêng. Heartbeat thời gian 1970 bị Backend từ chối cho đến khi SNTP sync.
11. **Hướng phát triển:** hiệu chuẩn cảm biến đất, test PIR/OTA/Automation,
    triển khai TTS Việt độc lập với máy khách nếu cần, HTTPS ngoài LAN và biểu
    đồ lịch sử chuyên sâu.

## Tài liệu liên quan

- [SYSTEM_SPEC.md](docs/SYSTEM_SPEC.md): phạm vi và kiến trúc contract.
- [DATABASE_SPEC.md](docs/DATABASE_SPEC.md): database contract.
- [API_SPEC.md](docs/API_SPEC.md): REST API contract.
- [MQTT_SPEC.md](docs/MQTT_SPEC.md): MQTT topic/payload contract.
- [BACKEND_GUIDE.md](backend/BACKEND_GUIDE.md): hướng dẫn Backend.
- [FIRMWARE_GUIDE.md](firmware/esp32-generic-node/FIRMWARE_GUIDE.md): firmware và debug.
