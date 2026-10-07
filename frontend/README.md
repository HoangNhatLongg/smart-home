# Dashboard Smart Home

Frontend Next.js cho Home, Room, ESP32 node, telemetry, relay, Automation,
Configuration, OTA và Voice Web. Tài liệu kiến trúc/kiểm thử để viết báo cáo
nằm trong [README gốc](../README.md); contract REST ở
[API_SPEC.md](../docs/API_SPEC.md).

## Chạy với Backend thật

Từ thư mục `frontend`:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Trong `.env.local`, đặt:

```env
NEXT_PUBLIC_API_MODE=real
BACKEND_URL=http://localhost:3001
```

Backend chạy ở cổng 3001; Frontend thường ở cổng 3000. Truy cập URL được
terminal in ra, đăng nhập bằng tài khoản đã có trong Backend. Frontend gọi
`/api/...` cùng origin; Next.js rewrite chuyển request tới `BACKEND_URL`, giữ
cookie session. Nếu dùng `mock`, UI chỉ hiển thị dữ liệu giả, không điều khiển
ESP thật. Khởi động lại Frontend sau khi đổi `.env.local`.

## Kiểm thử

```powershell
npm run typecheck
npm test
npm run build
```

Tại trang Giọng nói, nút **Nói** phụ thuộc hỗ trợ Speech Recognition của trình
duyệt. Ollama trên Backend xử lý văn bản, còn âm thanh trả lời phụ thuộc giọng
TTS Việt (`vi-VN`) của trình duyệt/hệ điều hành. Bấm **Thử giọng** để kiểm tra
riêng phần âm thanh; nếu thiếu giọng Việt, trang báo lỗi chứ không dùng giọng
Anh. Xem [hướng dẫn Voice](../docs/VOICE_INTEGRATION.md).
