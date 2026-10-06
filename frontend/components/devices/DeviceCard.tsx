import Link from "next/link";
import { ChevronRight, Cpu, Droplets, Lightbulb, MapPin, Thermometer } from "lucide-react";
import { RelayControls } from "@/components/devices/RelayToggle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Device, DeviceState, TelemetryPoint } from "@/lib/api/contract";
import type { CommandTrackerController } from "@/lib/hooks/useCommandTracker";
import { formatHumidity, formatRelativeTime, formatTemperature } from "@/lib/format";

const CAPABILITY_LABELS: Record<string, string> = {
  relay: "Rơ-le",
  temperature: "Nhiệt độ",
  humidity: "Độ ẩm",
  soil_moisture: "Độ ẩm đất",
  motion: "Chuyển động",
};

export interface DeviceCardProps {
  device: Device;
  state: DeviceState | null;
  telemetry: TelemetryPoint | null;
  tracker: CommandTrackerController;
}

export function DeviceCard({ device, state, telemetry, tracker }: DeviceCardProps) {
  const visibleCapabilities = device.capabilities.filter(
    (capability) => capability.code !== "relay" || capability.config?.configured !== false,
  );
  const relays = visibleCapabilities.filter((capability) => capability.code === "relay");
  const temperature = telemetry?.data.temperature ?? null;
  const humidity = telemetry?.data.humidity ?? null;
  const hasSensors = temperature !== null || humidity !== null;
  const isRelay = relays.length > 0;

  return (
    <article className="flex flex-col rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${isRelay ? "bg-amber-50 text-amber-600" : "bg-accent-subtle text-accent"}`}>
            {isRelay ? <Lightbulb size={20} strokeWidth={1.8} aria-hidden /> : <Cpu size={20} strokeWidth={1.8} aria-hidden />}
          </span>
          <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{device.name}</h2>
          <p className="mt-0.5 truncate text-xs text-ink-subtle">
            {device.roomName ? <><MapPin className="mr-1 inline" size={12} strokeWidth={1.75} aria-hidden />{device.roomName} · </> : ""}{device.deviceId}
          </p>
          </div>
        </div>
        <StatusBadge status={device.status} />
      </header>

      <div className="space-y-3.5 px-4 py-3.5">
        {hasSensors ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-surface-muted px-2.5 py-2">
              <dt className="flex items-center gap-1 text-xs text-ink-subtle"><Thermometer size={13} className="text-bad" aria-hidden />Nhiệt độ</dt>
              <dd className="mt-1 font-medium text-ink">{formatTemperature(temperature)}</dd>
            </div>
            <div className="rounded-md bg-surface-muted px-2.5 py-2">
              <dt className="flex items-center gap-1 text-xs text-ink-subtle"><Droplets size={13} className="text-info" aria-hidden />Độ ẩm</dt>
              <dd className="mt-1 font-medium text-ink">{formatHumidity(humidity)}</dd>
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

        {visibleCapabilities.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="text-xs font-medium text-ink-muted">Thiết bị gắn với ESP node</p>
            <p className="mt-1 text-xs text-ink-subtle">
              {visibleCapabilities.map((capability) => capability.name ?? CAPABILITY_LABELS[capability.code] ?? capability.instanceCode).join(" · ")}
            </p>
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
          {visibleCapabilities.length > 0 && (
            <div className="flex items-baseline gap-1.5">
              <dt>Cảm biến</dt>
              <dd className="text-ink-muted">
                {visibleCapabilities
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
