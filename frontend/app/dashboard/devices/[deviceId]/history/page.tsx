"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { Badge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import { getDevice, getStateHistory } from "@/lib/api";
import { formatDateTime, formatHistoryValue } from "@/lib/format";

const ROW_SHELL = "flex items-center justify-between gap-4 px-4 py-2.5 text-sm";
const ROW_LABEL = "text-xs text-ink-subtle";

export default function StateHistoryPage() {
  const params = useParams<{ deviceId: string }>();
  const raw = params.deviceId;
  const deviceId = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  const decoded = decodeURIComponent(deviceId);

  const deviceResource = usePollingResource(() => getDevice(decoded), {
    intervalMs: 30_000,
    enabled: decoded !== "",
  });
  const historyResource = usePollingResource(
    () => getStateHistory(decoded, { limit: 100 }),
    { intervalMs: 15_000, enabled: decoded !== "" },
  );

  const entries = historyResource.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lịch sử trạng thái"
        description="Mọi thay đổi trạng thái thiết bị đã ghi nhận, mới nhất trước."
        meta={
          <>
            <span>{deviceResource.data?.name ?? decoded}</span>
            <PollBadge updatedAt={historyResource.lastUpdatedAt} busy={historyResource.loading} />
          </>
        }
        actions={
          <>
            <Link
              href={`/dashboard/devices/${encodeURIComponent(decoded)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-muted"
            >
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
              Về thiết bị
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={historyResource.refresh}
              icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
            >
              Làm mới
            </Button>
          </>
        }
      />

      <DataState
        loading={historyResource.loading}
        error={historyResource.error}
        onRetry={historyResource.refresh}
        isEmpty={entries.length === 0}
        emptyMessage="Thiết bị chưa ghi nhận thay đổi trạng thái nào."
      >
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="hidden w-full text-left text-sm sm:table">
            <thead className="border-b border-line-strong bg-surface-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Thời điểm</th>
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Tính năng</th>
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Giá trị</th>
                <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Nguồn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-2.5 text-ink-muted">{formatDateTime(entry.recordedAt)}</td>
                  <td className="px-4 py-2.5 text-ink">{entry.capability}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{formatHistoryValue(entry.value)}</td>
                  <td className="px-4 py-2.5">
                    {entry.commandId ? (
                      <Badge tone="info">{entry.commandId}</Badge>
                    ) : (
                      <span className="text-xs text-ink-subtle">Thiết bị tự đổi</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-line sm:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{entry.capability}</span>
                  <span className="text-sm font-semibold text-ink">
                    {formatHistoryValue(entry.value)}
                  </span>
                </div>
                <div className={`${ROW_SHELL} -mx-4 px-4 py-0`}>
                  <span className={ROW_LABEL}>Ghi lúc</span>
                  <span className="text-xs text-ink-muted">{formatDateTime(entry.recordedAt)}</span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className={ROW_LABEL}>Nguồn</span>
                  {entry.commandId ? (
                    <Badge tone="info">{entry.commandId}</Badge>
                  ) : (
                    <span className="text-xs text-ink-subtle">Thiết bị tự đổi</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </DataState>
    </div>
  );
}