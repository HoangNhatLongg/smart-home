"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Right-hand slide-over. Shares the overlay z-index layer (50) with Modal. */
export function Drawer({ open, title, onClose, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Đóng bảng điều khiển giọng nói"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-[min(24rem,100vw)] flex-col border-l border-line bg-surface shadow-[-16px_0_48px_rgba(16,24,40,0.12)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-md p-1 text-ink-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="border-t border-line px-4 py-3 text-xs">{footer}</footer>
        )}
      </aside>
    </div>
  );
}

export interface VoiceDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Global voice control drawer. Mounted once by the dashboard layout. */
export function VoiceDrawer({ open, onClose, children }: VoiceDrawerProps) {
  return (
    <Drawer open={open} title="Điều khiển bằng giọng nói" onClose={onClose}>
      {children}
      <p className="mt-4 text-xs text-ink-subtle">
        Cần trình duyệt hỗ trợ nhận dạng giọng nói.{" "}
        <Link
          href="/dashboard/voice"
          onClick={onClose}
          className="font-medium text-accent hover:underline"
        >
          Mở trang giọng nói
        </Link>
      </p>
    </Drawer>
  );
}