"use client";

import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { formatDateTime, formatHumidity, formatTemperature } from "@/lib/format";
import type { TelemetryPoint } from "@/lib/api/contract";

function Reading({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-muted px-3 py-2.5">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

export default function EnvironmentPage() {
  const tree = useDeviceTree();
  const snapshot = tree.snapshot;
  const readings = (snapshot?.devices ?? [])
    .map((device) => ({ device, point: snapshot?.telemetry[device.deviceId] ?? null }))
    .filter((item): item is { device: (typeof item)["device"]; point: TelemetryPoint } =>
      item.point !== null,
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Môi trường"
        description="Số đo nhiệt độ và độ ẩm của từng thiết bị trong nhà."
        meta={<PollBadge updatedAt={tree.updatedAt} busy={tree.status === "loading"} />}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={tree.refresh}
            icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
          >
            Làm mới
          </Button>
        }
      />

      <DataState
        loading={tree.status === "loading" && snapshot === null}
        error={tree.error}
        onRetry={tree.refresh}
        isEmpty={readings.length === 0}
        emptyMessage="Chưa có thiết bị nào gửi số đo môi trường."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {readings.map(({ device, point }) => (
            <article key={device.deviceId} className="flex flex-col rounded-lg border border-line bg-surface">
              <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink">{device.name}</h2>
                  <p className="mt-0.5 truncate text-xs text-ink-subtle">
                    {device.roomName ? `${device.roomName} · ` : ""}
                    {device.deviceId}
                  </p>
                </div>
                <StatusBadge status={device.status} />
              </header>

              <dl className="grid grid-cols-2 gap-3 px-4 py-3.5">
                <Reading label="Nhiệt độ" value={formatTemperature(point.data.temperature ?? null)} />
                <Reading label="Độ ẩm" value={formatHumidity(point.data.humidity ?? null)} />
              </dl>

              <footer className="mt-auto flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
                <span className="text-xs text-ink-subtle">
                  Ghi lúc {formatDateTime(point.recordedAt)}
                </span>
                <Link
                  href={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Biểu đồ
                  <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
                </Link>
              </footer>
            </article>
          ))}
        </div>
      </DataState>
    </div>
  );
}