"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-[0_20px_48px_rgba(16,24,40,0.18)] outline-none"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-1 rounded-md p-1 text-ink-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <footer className="mt-5 flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}
