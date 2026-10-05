"use client";

import Link from "next/link";
import { History, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { CommandFeedback } from "@/components/devices/CommandFeedback";
import { RelayControls } from "@/components/devices/RelayToggle";
import { TelemetryPanel } from "@/components/devices/TelemetryPanel";
import { ConfigurationPanel } from "@/components/devices/ConfigurationPanel";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import { getConfigurationStatus, getDevice, getTelemetry } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

const CAPABILITY_LABELS: Record<string, string> = {
  relay: "Rơ-le",
  temperature: "Nhiệt độ",
  humidity: "Độ ẩm",
};

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const raw = params.deviceId;
  const deviceId = Array.isArray(raw) ? raw[0] : raw;
  const decoded = deviceId ? decodeURIComponent(deviceId) : "";

  const tree = useDeviceTree();
  const tracker = useCommandTracker({ onConfirmed: tree.refresh });

  const deviceResource = usePollingResource(
    () => getDevice(decoded),
    { intervalMs: 15_000, enabled: decoded !== "" },
  );
  const telemetryResource = usePollingResource(
    () => getTelemetry(decoded, { limit: 60 }),
    { intervalMs: 30_000, enabled: decoded !== "" },
  );
  const configResource = usePollingResource(
    () => getConfigurationStatus(decoded),
    { intervalMs: 5_000, enabled: decoded !== "" },
  );

  const device = deviceResource.data ?? tree.snapshot?.devices.find((item) => item.deviceId === decoded);
  const state = tree.snapshot?.states[decoded] ?? null;

  if (!decoded) {
    return <DataState loading={false} error={null}>Không tìm thấy thiết bị.</DataState>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={device?.name ?? decoded}
        description={device?.roomName ? `Thuộc phòng ${device.roomName}.` : undefined}
        meta={
          <>
            <span>{decoded}</span>
            {device && <StatusBadge status={device.status} />}
            {device?.lastSeenAt ? <span>Nhìn thấy {formatRelativeTime(device.lastSeenAt)}</span> : null}
          </>
        }
        actions={
          <>
            <Link
              href={`/dashboard/devices/${encodeURIComponent(decoded)}/history`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-muted"
            >
              <History size={14} strokeWidth={1.75} aria-hidden />
              Lịch sử trạng thái
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={tree.refresh}
              icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
            >
              Làm mới
            </Button>
          </>
        }
      />

      <DataState
        loading={deviceResource.loading && device === undefined}
        error={deviceResource.error}
        onRetry={deviceResource.refresh}
      >
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Điều khiển"
              description="Công tắc chỉ chuyển sau khi thiết bị báo xác nhận."
              actions={<PollBadge updatedAt={tree.updatedAt} busy={tree.status === "loading"} />}
            >
              {device ? (
                <RelayControls device={device} state={state?.state} tracker={tracker} />
              ) : (
                <p className="text-sm text-ink-subtle">Không tải được thông tin thiết bị.</p>
              )}
            </Section>

            <Section title="Thông tin thiết bị">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-subtle">Phòng</dt>
                  <dd className="mt-0.5 text-ink">{device?.roomName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-subtle">Phiên bản phần mềm</dt>
                  <dd className="mt-0.5 text-ink">{device?.firmwareVersion ?? "Chưa có"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-subtle">Trạng thái gần nhất</dt>
                  <dd className="mt-0.5 text-ink">
                    {state ? formatRelativeTime(state.updatedAt) : "Chưa có"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-subtle">Tính năng</dt>
                  <dd className="mt-0.5 text-ink">
                    {device?.capabilities
                      .map(
                        (capability) =>
                          `${capability.name ?? CAPABILITY_LABELS[capability.code] ?? capability.code}`,
                      )
                      .join(", ") || "—"}
                  </dd>
                </div>
              </dl>
            </Section>
          </div>

          <TelemetryPanel points={telemetryResource.data ?? []} loading={telemetryResource.loading} />

          {device && (
            <ConfigurationPanel
              device={device}
              configuration={configResource.data}
              onRefresh={configResource.refresh}
            />
          )}
        </div>
      </DataState>

      <CommandFeedback
        tracker={tracker}
        states={tree.snapshot?.states ?? {}}
        devices={device ? [device] : []}
      />
    </div>
  );
}