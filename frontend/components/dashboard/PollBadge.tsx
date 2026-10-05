"use client";

import { Spinner } from "@/components/ui/Spinner";
import { formatRelativeTime } from "@/lib/format";

export function PollBadge({
  updatedAt,
  busy,
  label = "Cập nhật",
}: {
  updatedAt: number | null;
  busy: boolean;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-subtle">
      {busy && <Spinner label="Đang làm mới" />}
      {updatedAt
        ? `${label} ${formatRelativeTime(new Date(updatedAt).toISOString())}`
        : busy
          ? "Đang làm mới..."
          : "Chưa có dữ liệu"}
    </span>
  );
}