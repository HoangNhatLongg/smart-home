"use client";

import { Activity, LogOut, Menu, Mic } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/StatusBadge";
import type { ApiMode } from "@/lib/api";

export interface HeaderProps {
  userEmail: string | null;
  apiMode: ApiMode;
  signingOut: boolean;
  onToggleNav: () => void;
  onOpenVoice: () => void;
  onSignOut: () => void;
}

export function Header({
  userEmail,
  apiMode,
  signingOut,
  onToggleNav,
  onOpenVoice,
  onSignOut,
}: HeaderProps) {
  const pathname = usePathname();
  const pageNames: Record<string, string> = {
    "/dashboard": "Tổng quan",
    "/dashboard/homes": "Ngôi nhà",
    "/dashboard/rooms": "Phòng",
    "/dashboard/devices": "Thiết bị",
    "/dashboard/environment": "Môi trường",
    "/dashboard/automation": "Tự động hóa",
    "/dashboard/ota": "Cập nhật OTA",
    "/dashboard/voice": "Trợ lý giọng nói",
  };
  const currentPage = pageNames[pathname] ?? "Thiết bị";
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          aria-label="Mở menu"
          onClick={onToggleNav}
          icon={<Menu size={16} strokeWidth={1.75} aria-hidden />}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{currentPage}</p>
          <p className="hidden truncate text-xs text-ink-subtle sm:block">Giám sát và điều khiển nhà thông minh</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Điều khiển bằng giọng nói"
          onClick={onOpenVoice}
          icon={<Mic size={16} strokeWidth={1.75} aria-hidden />}
        >
          <span className="hidden sm:inline">Giọng nói</span>
        </Button>
        <Badge tone={apiMode === "mock" ? "warn" : "info"}>
          <Activity size={12} strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">
            {apiMode === "mock" ? "Dữ liệu mô phỏng" : "Máy chủ thật"}
          </span>
          <span className="sm:hidden">{apiMode === "mock" ? "Mô phỏng" : "Thật"}</span>
        </Badge>
        <span className="hidden max-w-36 truncate text-xs text-ink-subtle lg:inline" title={userEmail ?? undefined}>
          {userEmail ?? "Chưa đăng nhập"}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSignOut}
          disabled={signingOut}
          icon={<LogOut size={14} strokeWidth={1.75} aria-hidden />}
        >
          <span className="hidden sm:inline">
            {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </span>
        </Button>
      </div>
    </header>
  );
}
