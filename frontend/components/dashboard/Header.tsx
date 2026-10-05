"use client";

import { LogOut, Menu, Mic } from "lucide-react";
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
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
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
          <p className="truncate text-sm font-semibold text-ink">Bảng điều khiển</p>
          <p className="truncate text-xs text-ink-subtle">{userEmail ?? "Chưa đăng nhập"}</p>
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
          <span className="hidden sm:inline">
            {apiMode === "mock" ? "Dữ liệu mô phỏng" : "Máy chủ thật"}
          </span>
          <span className="sm:hidden">{apiMode === "mock" ? "Mô phỏng" : "Thật"}</span>
        </Badge>
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