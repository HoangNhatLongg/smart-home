"use client";

import { VoicePanel } from "@/components/voice/VoicePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";

export default function VoicePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Giọng nói"
        description="Nói hoặc gõ lệnh bật/tắt thiết bị, hỏi nhiệt độ và độ ẩm. Trình duyệt nhận giọng nói và đọc câu trả lời bằng tiếng Việt khi có giọng đọc phù hợp."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Section title="Đặt lệnh" description="Kết quả và trạng thái xác nhận hiển thị ngay dưới đây.">
          <VoicePanel />
        </Section>

        <Section title="Hiểu đúng về cách báo cáo">
          <ul className="space-y-2.5 text-sm text-ink-muted">
            <li>
              Khi hệ thống hiện <span className="font-medium text-ink">đã phân tích xong</span>, điều đó mới
              chỉ nghĩa yêu cầu đã được hiểu và lệnh đã được tạo.
            </li>
            <li>
              Báo <span className="font-medium text-ink">thiết bị đã xác nhận</span> chỉ xuất hiện sau khi
              thiết bị báo ngược lại trạng thái thật.
            </li>
            <li>
              Nếu hết thời gian chờ, bạn có thể kiểm tra lại trạng thái ở trang thiết bị thay vì coi là đã
              thực hiện.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
