import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nhà thông minh",
  description: "Quản lý thiết bị, nhiệt độ, độ ẩm, hẹn giờ và cập nhật phần mềm cho ngôi nhà của bạn.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}