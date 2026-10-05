# Hướng dẫn Backend Smart Home IoT

## Mục đích và phạm vi

Backend dùng Next.js, PostgreSQL/Prisma, MQTT.js và EMQX. Bản hiện tại hoàn thành Phase 1–3: Auth, Home/Room/Device, Capability Registry, MQTT availability/capability/telemetry/state, command confirmation và retry. Configuration, Automation, OTA, Voice thuộc Phase 4–5 và chưa có API.

## Yêu cầu

- Node.js 20+ và Docker Desktop.
- Các port 5432, 1883, 18083 và port Next.js (mặc định 3000) phải khả dụng.

## Cài đặt lần đầu

Mở PowerShell:

    cd C:\CNTT\IOT\DoAn\smart-home\backend
    Copy-Item .env.example .env
    npm install

Mở file .env và cấu hình:

    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smarthome?schema=public"
    MQTT_URL="mqtt://localhost:1883"
    AUTH_SECRET="mot-chuoi-bi-mat-dai-va-ngau-nhien"
    COMMAND_TIMEOUT_MS="5000"
    COMMAND_MAX_RETRIES="2"

Không dùng AUTH_SECRET mẫu ở môi trường thật.

## Khởi động PostgreSQL và EMQX

Từ thư mục backend chạy:

    docker compose -f ..\docker\docker-compose.yml up -d
    docker compose -f ..\docker\docker-compose.yml ps

EMQX Dashboard là http://localhost:18083. PostgreSQL được xuất ra cổng localhost:5432.

## Migration và seed

Tạo migration, áp dụng schema và thêm dữ liệu khởi tạo:

    npm run db:migrate -- --name init
    npm run db:seed

Seed tạo Capability Registry: temperature (number, °C), humidity (number, %) và relay (boolean). Nó cũng tạo user demo user@example.com với password ChangeMe123!.

Chỉ dùng user demo ở local. Có thể đặt SEED_USER_EMAIL và SEED_USER_PASSWORD trước khi chạy seed.

## Chạy và kiểm tra source

    npm run dev
    npm run typecheck
    npm run build

Terminal in ra URL thực tế. Nếu port 3000 bận, Next.js có thể chuyển sang 3001; dùng đúng port đó trong các request bên dưới.

## Đăng nhập

Login chỉ chấp nhận POST. Mở /api/auth/login trong thanh địa chỉ trình duyệt tạo GET và nhận 405 Method Not Allowed — đây là hành vi đúng.

Ví dụ PowerShell, với URL ứng dụng đang chạy:

    $baseUrl = "http://localhost:3000"
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"user@example.com","password":"ChangeMe123!"}' -WebSession $session

Kết quả thành công là HTTP 200 với user id và email. Session giữ cookie đăng nhập để dùng với các API sau.

Kiểm tra session:

    Invoke-WebRequest -Uri "$baseUrl/api/auth/me" -WebSession $session

Đăng xuất:

    Invoke-WebRequest -Uri "$baseUrl/api/auth/logout" -Method POST -WebSession $session

Sau logout, GET /api/auth/me trả 401. Login sai password cũng trả 401.

## API đã có

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| POST | /api/auth/login | Đăng nhập |
| POST | /api/auth/logout | Đăng xuất |
| GET | /api/auth/me | User hiện tại |
| GET, POST | /api/homes | Liệt kê/tạo Home |
| GET, PUT | /api/homes/:homeId | Xem/sửa Home |
| GET, POST | /api/homes/:homeId/rooms | Liệt kê/tạo Room |
| PUT, DELETE | /api/rooms/:roomId | Sửa/xóa Room |
| GET | /api/rooms/:roomId/devices | Device trong Room |
| GET, PUT | /api/devices/:deviceId | Xem/sửa Device |
| GET | /api/capabilities/registry | Capability Registry |
| GET | /api/devices/:deviceId/capabilities | Capability của Device |
| GET | /api/devices/:deviceId/telemetry | Telemetry; query from, to, limit |
| GET | /api/devices/:deviceId/state | Current state |
| GET | /api/devices/:deviceId/state-history | State history |
| POST | /api/devices/:deviceId/commands | Tạo relay command |
| GET | /api/commands/:commandId | Trạng thái command |

Trừ login, mọi API cần session. Authorization kiểm tra Home owner; không sở hữu Home sẽ trả 403.

## Ví dụ tạo Home và Room

Sau khi login:

    $home = Invoke-RestMethod -Uri "$baseUrl/api/homes" -Method POST -ContentType "application/json" -Body '{"name":"Nhà chính"}' -WebSession $session
    $room = Invoke-RestMethod -Uri "$baseUrl/api/homes/$($home.id)/rooms" -Method POST -ContentType "application/json" -Body '{"name":"Phòng khách"}' -WebSession $session

Contract hiện tại không có endpoint tạo Device công khai. Device cần được provision qua database/luồng thiết bị trước khi test MQTT.

## MQTT

Backend subscribe các topic sau:

| Topic | QoS | Xử lý |
| --- | ---: | --- |
| smarthome/{home_id}/{room_id}/{device_id}/telemetry | 0 | Lưu JSON telemetry |
| smarthome/{home_id}/{room_id}/{device_id}/state | 1 | Current state/history, xác nhận command |
| smarthome/{home_id}/{room_id}/{device_id}/availability | 1 | Cập nhật online/offline |
| smarthome/{home_id}/{room_id}/{device_id}/capability | 1 | Đồng bộ registry capability |

Backend publish command vào topic smarthome/{home_id}/{room_id}/{device_id}/command, QoS 1, không retained. home_id là UUID Home, room_id là UUID Room, device_id là trường devices.device_id như esp32-c3-001.

Availability online:

    {"status":"online","timestamp":"2026-10-05T08:00:00Z"}

Telemetry:

    {"timestamp":"2026-10-05T08:00:00Z","data":{"temperature":28.5,"humidity":72}}

State xác nhận:

    {"command_id":"command-id-tu-backend","timestamp":"2026-10-05T08:00:05Z","state":{"relay_1":true}}

MQTT publish thành công không làm command SUCCESS. Chỉ state cùng command_id và đúng relay state mới xác nhận SUCCESS.

## Test relay command

Device cần online, có capability relay_1 và firmware cần publish State xác nhận.

    $deviceId = "esp32-c3-001"
    $command = Invoke-RestMethod -Uri "$baseUrl/api/devices/$deviceId/commands" -Method POST -ContentType "application/json" -Body '{"commandType":"set_relay","payload":{"capability":"relay_1","state":true}}' -WebSession $session
    Invoke-RestMethod -Uri "$baseUrl/api/commands/$($command.commandId)" -WebSession $session

API ban đầu trả PENDING. Backend gửi command, chờ State, retry tối đa theo COMMAND_MAX_RETRIES rồi đặt SUCCESS, FAILED hoặc TIMEOUT.

## Lỗi thường gặp

| Vấn đề | Xử lý |
| --- | --- |
| 405 khi mở login trên browser | Dùng POST bằng PowerShell/Postman. |
| 401 | Login lại và truyền cookie/session. |
| 403 | User không sở hữu Home của resource. |
| MQTT broker unavailable | Kiểm tra Docker EMQX, MQTT_URL và port 1883. |
| Command TIMEOUT | Kiểm tra Device online, topic/payload và State command_id. |
| Prisma connection error | Kiểm tra Docker PostgreSQL, DATABASE_URL, migration. |

## Dừng môi trường local

    docker compose -f ..\docker\docker-compose.yml down

Lệnh trên giữ dữ liệu trong Docker volume. Dùng docker compose -f ..\docker\docker-compose.yml down -v nếu thực sự muốn xóa dữ liệu demo.
