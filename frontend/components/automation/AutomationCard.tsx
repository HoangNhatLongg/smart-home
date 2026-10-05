"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/StatusBadge";
import type { Automation } from "@/lib/api/contract";
import type { AutomationLogView } from "@/lib/automation-log";
import { formatRelativeTime } from "@/lib/format";

const COMMAND_VERBS: Record<string, string> = {
  set_relay: "Bật/tắt",
  toggle_relay: "Bật/tắt",
};

function actionSentence(
  automation: Automation,
  deviceName: string | null,
): string {
  const raw = automation.action.params.state;
  const verb = typeof raw === "boolean" ? (raw ? "Bật" : "Tắt") : COMMAND_VERBS[automation.action.command] ?? "Thực hiện";
  const target = deviceName ?? automation.action.deviceId;
  return `${verb} ${target} · ${automation.action.capability}`;
}

export function AutomationCard({
  automation,
  deviceName,
  lastRun,
  onEdit,
  onDelete,
  deleting,
}: {
  automation: Automation;
  deviceName: string | null;
  lastRun: AutomationLogView | null;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <article className="flex flex-col rounded-lg border border-line bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{automation.name}</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            Hằng ngày lúc {automation.schedule.time}
          </p>
        </div>
        <Badge tone={automation.enabled ? "ok" : "neutral"}>
          {automation.enabled ? "Đang bật" : "Đang tắt"}
        </Badge>
      </header>

      <div className="flex-1 space-y-3 px-4 py-3.5">
        <p className="text-sm text-ink">{actionSentence(automation, deviceName)}</p>

        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-subtle">Lần chạy gần nhất</dt>
            <dd className="text-ink-muted">
              {lastRun?.ranAt ? formatRelativeTime(lastRun.ranAt) : "Chưa có lần chạy nào"}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-subtle">Kết quả</dt>
            <dd
              className={
                lastRun?.ok === true
                  ? "font-medium text-ok"
                  : lastRun?.ok === false
                    ? "font-medium text-bad"
                    : "text-ink-muted"
              }
            >
              {lastRun?.ok === true
                ? "Thiết bị xác nhận"
                : lastRun?.ok === false
                  ? "Không thành công"
                  : "Chưa rõ"}
            </dd>
          </div>
        </dl>
      </div>

      <footer className="flex gap-2 border-t border-line px-4 py-2.5">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Sửa
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete} disabled={deleting}>
          Xóa
        </Button>
      </footer>
    </article>
  );
}