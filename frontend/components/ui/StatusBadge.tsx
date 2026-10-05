import type { DeviceStatus } from "@/lib/api/contract";
import { deviceStatusLabel, deviceStatusTone } from "@/lib/format";

const DOT_TONES: Record<DeviceStatus, string> = {
  online: "bg-ok-dot",
  offline: "bg-bad-dot",
  unknown: "bg-line-strong",
};

export function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium ${deviceStatusTone(status)}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${DOT_TONES[status]}`} />
      {deviceStatusLabel(status)}
    </span>
  );
}

export type BadgeTone = "neutral" | "ok" | "warn" | "bad" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-ink-muted ring-1 ring-inset ring-line",
  ok: "bg-ok-subtle text-ok",
  warn: "bg-warn-subtle text-warn",
  bad: "bg-bad-subtle text-bad",
  info: "bg-info-subtle text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}