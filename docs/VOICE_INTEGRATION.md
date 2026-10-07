# Điều khiển Smart Home bằng giọng nói trên Web và Xiaozhi

## Luồng hoạt động

Web dùng Speech Recognition của trình duyệt để chuyển giọng nói thành văn bản,
gửi `POST /api/voice/command` với session đăng nhập, rồi đọc câu trả lời bằng
Speech Synthesis. Board `custom-robot` của Xiaozhi dùng MCP tool
`self.smarthome.ask` để gửi câu nói tới `POST /api/voice/xiaozhi` bằng robot
token. Cả hai API dùng chung bộ phân giải phòng/relay và Command Service.
Xiaozhi không phát MQTT trực tiếp.

Khi `VOICE_PROVIDER=ollama`, Backend dùng model Ollama cục bộ để phân loại câu
nói linh hoạt thành `CONTROL_DEVICE`, `QUERY_ENVIRONMENT` hoặc yêu cầu nói rõ
hơn. Model chỉ được chọn ID từ danh sách phòng/relay thuộc Home đã xác thực;
Backend kiểm tra lại ID, sự mơ hồ, trạng thái thiết bị và State xác nhận trước
khi báo thành công. Đây là prompt với ví dụ và JSON schema, **không phải**
fine-tune hay huấn luyện lại trọng số model. Khi không bật Ollama, bộ nhận diện
theo quy tắc cũ vẫn dùng được. Nếu Ollama đã bật nhưng không phản hồi, Backend
báo lỗi và không gửi lệnh thay vì âm thầm đoán. Ollama chỉ xử lý lời nói từ
trang Web. Xiaozhi có timeout HTTP 25 giây nên vẫn dùng bộ nhận diện cũ trong
Backend; model hội thoại của robot do dịch vụ Xiaozhi cấu hình độc lập.

Trình duyệt nhận giọng nói với ngôn ngữ `vi-VN`. Khi bật ô "Đọc câu trả lời
bằng tiếng Việt", trang chỉ phát âm khi trình duyệt cung cấp giọng Speech
Synthesis tiếng Việt. Nút "Thử giọng" kiểm tra phần âm thanh mà không gửi lệnh
tới thiết bị. Nếu máy chưa có giọng Việt, trang sẽ báo rõ và **không dùng giọng
Anh** thay thế. Trên Windows, cài Tiếng Việt kèm tùy chọn Chuyển văn bản thành
giọng nói trong Cài đặt → Thời gian & ngôn ngữ → Ngôn ngữ & khu vực, rồi tải
lại trình duyệt. Ollama xử lý văn bản, không tự tạo âm thanh.

Lệnh bật/tắt chỉ trả `success: true` sau khi Backend thấy Command `SUCCESS`
từ State có `command_id` tương ứng. Nếu thiết bị không phản hồi, trợ lý sẽ nói
chưa xác nhận. Câu hỏi môi trường đọc mẫu telemetry mới nhất của đúng phòng.
Mẫu quá 5 phút được báo là cũ.

## Cấu hình Backend

Để dùng AI cục bộ miễn phí, cài Ollama trên máy chạy Backend, tải model và
đặt trong `backend/.env`:

```powershell
ollama pull qwen2.5:1.5b-instruct
ollama list
```

```env
VOICE_PROVIDER="ollama"
OLLAMA_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen2.5:1.5b-instruct"
OLLAMA_TIMEOUT_MS="45000"
```

Máy đang chạy Backend phải truy cập được Ollama. Chỉ Backend gọi cổng 11434;
không cần mở cổng này cho điện thoại, ESP hay Internet. Sau khi sửa `.env`,
khởi động lại Backend. Nếu chỉ muốn bộ câu lệnh cũ, bỏ `VOICE_PROVIDER=ollama`.
Model 1.5B nhẹ, nhưng có thể hiểu sai tiếng Việt; hãy thử các câu thực tế và
chỉ tăng model khi máy đủ RAM. Không xem model là nguồn xác thực quyền hoặc
trạng thái thiết bị.

Để robot Xiaozhi dùng Voice API, trong cùng `backend/.env` đặt:

```env
XIAOZHI_HOME_ID="UUID-cua-ngoi-nha"
XIAOZHI_VOICE_TOKEN="chuoi-bi-mat-ngau-nhien-toi-thieu-32-ky-tu"
```

Lấy Home UUID qua `GET /api/homes` khi đã đăng nhập. Home ID là UUID 36 ký tự
có dấu gạch ngang, ví dụ `ae42b702-ab5f-4496-89bd-1aa28941282f`;
không được điền robot token vào trường này. Token có thể tạo trong PowerShell
bằng:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$robotToken = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
$robotToken
```

Giữ token riêng, không đưa vào GitHub. Khởi động lại Backend sau khi sửa `.env`.
Robot chỉ được dùng tài nguyên thuộc Home UUID này. Web tiếp tục phân quyền
qua tài khoản chủ sở hữu Home.

## Cấu hình robot custom-robot

Trong project `C:\CNTT\Xiaozhi\xiaozhi-esp32`, chọn board `custom-robot`.
Mở `idf.py menuconfig` và tìm `Xiaozhi Assistant → Custom Robot Smart Home Voice`:

- `Smart Home Backend URL`: địa chỉ LAN của máy chạy Backend, ví dụ
  `http://192.168.1.170:3001` (không dùng `localhost` trên robot).
- `Smart Home robot token`: đúng token trong `backend/.env`.

Build và nạp lại firmware. Robot và máy Backend phải nhìn thấy nhau qua mạng.
Giữ `sdkconfig` và firmware binary chứa token ở nơi riêng tư. Nếu dùng mạng
ngoài LAN tin cậy, dùng HTTPS cho Backend.

## Câu thử nghiệm

1. Đặt tên relay trong Dashboard, ví dụ `Đèn phòng khách` hoặc `Quạt phòng ngủ`.
2. Nói với web và robot: `Bật đèn phòng khách`, `Tắt quạt phòng ngủ`.
3. Nói: `Nhiệt độ phòng khách hiện tại bao nhiêu?`,
   `Độ ẩm phòng ngủ hiện tại bao nhiêu?`.
4. Tắt node, thử lệnh bật: trợ lý phải báo node không kết nối.
5. Dùng hai phòng cùng loại hoặc nhiều relay cùng tên: trợ lý phải yêu cầu
   nói rõ hơn, không được điều khiển nhầm.
6. Dừng telemetry hơn 5 phút, hỏi nhiệt độ: trợ lý phải báo dữ liệu cũ.
7. Thử câu tự nhiên như `Cho đèn phòng khách sáng lên`, `Ngừng quạt phòng ngủ`,
   `Trong phòng khách nóng bao nhiêu độ?`; kiểm tra model chọn đúng mục tiêu.
8. Thử `Bật đèn` khi có hai đèn và `Đừng bật đèn`: không được tạo Command.
9. Dừng Ollama rồi thử lại: Backend phải báo AI không phản hồi và không gửi lệnh.

Có thể chạy kiểm tra schema/ID của Ollama từ thư mục `backend`:

```powershell
npx tsx --test tests/voice-ollama.test.ts
```

Đây không thay thế kiểm thử thực tế với ESP: chỉ khi Backend nhận State có
`command_id` phù hợp mới được báo lệnh thành công.

Nếu web không hiện nút micro, trình duyệt không hỗ trợ Web Speech API. Có thể
gõ câu lệnh vào cùng ô để kiểm thử. Speech Recognition/Synthesis là khả năng
của trình duyệt, chất lượng nhận tiếng Việt phụ thuộc trình duyệt và thiết bị.
Trên điện thoại, truy cập web qua HTTPS để trình duyệt cấp quyền micro; HTTP
qua địa chỉ LAN có thể bị chặn. Chế độ demo (`NEXT_PUBLIC_API_MODE` khác
`real`) chỉ dùng dữ liệu giả, nên đặt `NEXT_PUBLIC_API_MODE=real` và
`BACKEND_URL=http://<IP-may-chay-backend>:3001` khi thử với ESP thật.

## API mẫu

```http
POST /api/voice/command
Content-Type: application/json

{"text":"Bật đèn phòng khách"}
```

```http
POST /api/voice/xiaozhi
Authorization: Bearer <robot-token>
Content-Type: application/json

{"text":"Độ ẩm phòng khách hiện tại bao nhiêu?"}
```

Response chung: `{ "success": true|false, "message": "...", "commandId": "..."|null }`.
Lệnh hỏi cảm biến không tạo Command nên `commandId` luôn `null`.
