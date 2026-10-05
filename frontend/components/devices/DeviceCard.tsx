import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RelayControls } from "@/components/devices/RelayToggle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Device, DeviceState, TelemetryPoint } from "@/lib/api/contract";
import type { CommandTrackerController } from "@/lib/hooks/useCommandTracker";
import { formatHumidity, formatRelativeTime, formatTemperature } from "@/lib/format";

const CAPABILITY_LABELS: Record<string, string> = {
  relay: "Rơ-le",
  temperature: "Nhiệt độ",
  humidity: "Độ ẩm",
};

export interface DeviceCardProps {
  device: Device;
  state: DeviceState | null;
  telemetry: TelemetryPoint | null;
  tracker: CommandTrackerController;
}

export function DeviceCard({ device, state, telemetry, tracker }: DeviceCardProps) {
  const relays = device.capabilities.filter((capability) => capability.code === "relay");
  const temperature = telemetry?.data.temperature ?? null;
  const humidity = telemetry?.data.humidity ?? null;
  const hasSensors = temperature !== null || humidity !== null;

  return (
    <article className="flex flex-col rounded-lg border border-line bg-surface">
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

      <div className="space-y-3.5 px-4 py-3.5">
        {hasSensors ? (
          <dl className="flex items-baseline gap-6 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-ink-subtle">Nhiệt độ</dt>
              <dd className="font-medium text-ink">{formatTemperature(temperature)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-ink-subtle">Độ ẩm</dt>
              <dd className="font-medium text-ink">{formatHumidity(humidity)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-ink-subtle">Thiết bị không gửi số đo môi trường.</p>
        )}

        {relays.length > 0 && (
          <div className="border-t border-line pt-3">
            <RelayControls device={device} state={state?.state} tracker={tracker} />
          </div>
        )}

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-subtle">
          <div className="flex items-baseline gap-1.5">
            <dt>Phiên bản</dt>
            <dd className="text-ink-muted">{device.firmwareVersion ?? "Chưa có"}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt>Nhìn thấy</dt>
            <dd className="text-ink-muted">
              {device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : "Chưa có"}
            </dd>
          </div>
          {device.capabilities.length > 0 && (
            <div className="flex items-baseline gap-1.5">
              <dt>Cảm biến</dt>
              <dd className="text-ink-muted">
                {device.capabilities
                  .filter((capability) => capability.code !== "relay")
                  .map(
                    (capability) =>
                      `${CAPABILITY_LABELS[capability.code] ?? capability.code}${
                        capability.unit ? ` (${capability.unit})` : ""
                      }`,
                  )
                  .join(", ") || "Không có"}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <footer className="border-t border-line px-4 py-2.5">
        <Link
          href={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Xem chi tiết
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      </footer>
    </article>
  );
}