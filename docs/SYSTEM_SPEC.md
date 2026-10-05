# Smart Home IoT --- System Specification v1.0

## 1. Mục đích

Tài liệu này là đặc tả nguồn chuẩn cho hệ thống Smart Home IoT. Mọi
AI/agent phát triển Backend, Frontend và Firmware phải tuân thủ tài liệu
này.

## 2. Phạm vi

Hệ thống là một nền tảng IoT có kiến trúc hỗ trợ nhiều Home, nhưng phiên
bản triển khai/đánh giá hiện tại chỉ triển khai một Home.

Hệ thống hỗ trợ: - Giám sát nhiệt độ và độ ẩm. - Điều khiển relay. -
Theo dõi Online/Offline. - Schedule automation. - Generic Node. -
Capability Registry. - Desired/Applied Configuration. - Firmware version
management và OTA do người dùng chủ động kích hoạt. - Voice AI trên Web
Dashboard, phạm vi hiện tại chỉ điều khiển thiết bị. - ESP32-S3 Xiaozhi
làm voice interface bổ sung. - Authentication Login/Logout. - Phân quyền
ở mức Home.

Không thuộc phạm vi MVP: - Multi-home triển khai vật lý thực tế. - Local
MQTT Broker/Bridge. - RBAC nhiều vai trò. - AI học thói quen. - AI phân
tích dữ liệu tự do. - OTA rollback. - Voice AI quản lý lịch hoặc truy
vấn lịch sử.

## 3. Công nghệ

-   Frontend/Backend: Next.js + Node.js.
-   Database: PostgreSQL.
-   MQTT client: MQTT.js.
-   MQTT Broker: EMQX.
-   Containerization: Docker.
-   IoT nodes: ESP32-C3.
-   Voice interface: ESP32-S3/Xiaozhi.
-   Sensor: DHT11.
-   Actuator: Relay.

## 4. Resource Model

``` text
User
 └── Home
      └── Room
           └── Device
                ├── Capability
                ├── Configuration
                ├── State
                ├── Telemetry
                └── Command
```

Một User có thể sở hữu nhiều Home trong mô hình dữ liệu, dù bản triển
khai hiện tại chỉ dùng một Home.

Authorization chỉ kiểm tra quyền sở hữu Home. Nếu User có quyền trên
Home thì được quản lý Room/Device/Capability thuộc Home đó.

## 5. Generic Node

ESP32-C3 dùng firmware nền Generic Node.

Firmware phải hỗ trợ các cơ chế chung: - Device identity. - Wi-Fi. -
MQTT. - Capability declaration. - Telemetry. - Command. - State. -
Availability/LWT. - Configuration. - Firmware version.

Một Device không được gắn cứng với một loại phần cứng duy nhất.
Capability quyết định thiết bị hỗ trợ chức năng nào.

## 6. Capability

Capability được khai báo bởi ESP32 và được Backend quản lý thông qua
Capability Registry.

Capability Registry hiện tại:

  code          type       data_type   unit
  ------------- ---------- ----------- ------
  temperature   sensor     number      °C
  humidity      sensor     number      \%
  relay         actuator   boolean     null

Một Device có thể có nhiều instance của cùng một Capability. Ví dụ
`relay_1`, `relay_2` đều có registry capability là `relay`.

## 7. Configuration

Backend lưu Desired Configuration. ESP32 áp dụng configuration và phản
hồi Applied Configuration.

``` text
Dashboard
  -> Backend
  -> MQTT config
  -> ESP32
  -> apply + NVS
  -> applied config
  -> Backend
```

Configuration không thay thế OTA. Nếu firmware không chứa Capability cần
thiết thì phải cập nhật firmware.

## 8. State

Hệ thống lưu: - Current state. - State history.

Backend chỉ xác nhận một command điều khiển thành công khi nhận được
State phù hợp từ Device.

Việc MQTT Broker nhận được command không đồng nghĩa Device đã thực hiện
thành công.

## 9. Command

Mọi command phải có `command_id`.

Command lifecycle:

``` text
PENDING
  -> SENT
  -> SUCCESS
  -> FAILED/TIMEOUT
```

Backend phải kiểm tra Availability trước khi gửi command.

Nếu Device Online nhưng không trả State: - retry có giới hạn; - không
retry vô hạn; - nếu hết retry: FAILED/TIMEOUT.

Nếu Device Offline: - không tiếp tục retry command trong cùng attempt; -
command kết thúc FAILED/TIMEOUT theo policy của Backend.

## 10. Telemetry

DHT11 gửi telemetry mặc định mỗi 30 giây.

Telemetry lưu dữ liệu gốc trong PostgreSQL dưới dạng JSONB để hỗ trợ
Generic Node.

Ví dụ:

``` json
{
  "temperature": 28.5,
  "humidity": 72.0
}
```

## 11. Automation

Automation là schedule-based và được thực hiện bởi Backend Scheduler.

Ví dụ: - 18:00 mỗi ngày -\> Relay 1 ON. - 22:30 mỗi ngày -\> Relay 1
OFF.

ESP32 không tự làm Scheduler trong MVP.

## 12. OTA

OTA là user-initiated.

Dashboard: 1. Hiển thị firmware hiện tại. 2. Hiển thị firmware khả dụng.
3. User chọn Update. 4. Backend tạo OTA Job. 5. Device thực hiện OTA. 6.
Device khởi động lại. 7. Device báo firmware version mới. 8. Backend xác
nhận Job.

Không yêu cầu rollback trong MVP.

## 13. Voice AI

Web Dashboard có Voice AI.

Phạm vi H1: - Chỉ `CONTROL_DEVICE`. - AI chuyển ngôn ngữ tự nhiên thành
structured intent/action. - Backend xác thực và thực thi. - AI không
được trực tiếp publish MQTT.

Luồng:

``` text
Voice
 -> Speech-to-Text
 -> Intent
 -> Backend
 -> MQTT
 -> Device
 -> State
 -> Backend
 -> AI response
```

Nếu chưa tích hợp STT/TTS kịp, có thể triển khai text-to-intent trước.

## 14. Xiaozhi

ESP32-S3/Xiaozhi là voice interface bổ sung.

Xiaozhi phải sử dụng cùng command/business layer với Dashboard Voice,
không bypass Backend.

## 15. Hardware Deployment

``` text
ESP32-C3-001: Phòng khách
  - DHT11
  - Relay 1 -> đèn phòng khách

ESP32-C3-002: Phòng ngủ
  - DHT11
  - Relay 2 -> đèn phòng ngủ

ESP32-C3-003: Bếp
  - DHT11

ESP32-C3-004: dự phòng/mở rộng
ESP32-C3-005: dự phòng/mở rộng

ESP32-S3-001: Xiaozhi
```

## 16. MQTT Architecture

Chỉ dùng Central Broker trong MVP:

``` text
ESP32 -> EMQX -> Backend
```

Local Broker/Bridge là hướng mở rộng, không triển khai trong MVP.

## 17. Non-negotiable rules

1.  Không đổi MQTT topic nếu chưa cập nhật MQTT_SPEC.
2.  Không đổi API response/request nếu chưa cập nhật API_SPEC.
3.  Không đổi schema DB nếu chưa cập nhật DATABASE_SPEC.
4.  Frontend không truy cập PostgreSQL trực tiếp.
5.  ESP32 không truy cập PostgreSQL.
6.  AI không trực tiếp điều khiển MQTT.
7.  Command thành công phải có State xác nhận.
8.  Không báo Voice AI "đã thực hiện" nếu chưa có State xác nhận.
9.  Configuration không thay thế OTA.
10. Không thêm tính năng mới làm thay đổi scope MVP nếu chưa thống nhất.
