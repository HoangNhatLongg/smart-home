import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RelayControls } from "@/components/devices/RelayToggle";
import { telemetryValueOf } from "@/lib/hooks/useDeviceTree";
import { formatHumidity, formatTemperature } from "@/lib/format";
import type { Device, DeviceState, TelemetryPoint } from "@/lib/api/contract";
import type { CommandTrackerController } from "@/lib/hooks/useCommandTracker";

export interface RoomRowProps {
  roomId: string;
  roomName: string;
  devices: Device[];
  states: Record<string, DeviceState | null>;
  telemetry: Record<string, TelemetryPoint | null>;
  tracker: CommandTrackerController;
}

/**
 * One row per room: room identity, how many devices are up, the two environment
 * readings, and the relays that can be switched from the overview.
 */
export function RoomRow({ roomId, roomName, devices, states, telemetry, tracker }: RoomRowProps) {
  const online = devices.filter((device) => device.status === "online").length;
  const relayDevices = devices.filter((device) =>
    device.capabilities.some((capability) => capability.code === "relay"),
  );
  const temperatures = devices
    .map((device) => telemetryValueOf(telemetry[device.deviceId], "temperature"))
    .filter((value): value is number => value !== null);
  const humidities = devices
    .map((device) => telemetryValueOf(telemetry[device.deviceId], "humidity"))
    .filter((value): value is number => value !== null);
  const average = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[15px] font-semibold text-ink">{roomName}</h2>
          <span className="shrink-0 text-xs text-ink-subtle">
            {online}/{devices.length} thiết bị
          </span>
        </div>
        <dl className="flex items-center gap-5 text-xs">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-subtle">Nhiệt độ</dt>
            <dd className="font-medium text-ink">{formatTemperature(average(temperatures))}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-subtle">Độ ẩm</dt>
            <dd className="font-medium text-ink">{formatHumidity(average(humidities))}</dd>
          </div>
        </dl>
      </header>

      {devices.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-subtle">Phòng chưa có thiết bị.</p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((device) => (
            <li key={device.deviceId} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
                    className="flex min-w-0 items-center gap-1 text-sm font-medium text-ink hover:text-accent hover:underline"
                  >
                    <span className="truncate">{device.name}</span>
                    <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                  <StatusBadge status={device.status} />
                </div>
                <span className="text-xs text-ink-subtle">{device.deviceId}</span>
              </div>
              {relayDevices.includes(device) && (
                <div className="mt-2.5">
                  <RelayControls device={device} state={states[device.deviceId]?.state} tracker={tracker} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-line px-4 py-2">
        <Link
          href={`/dashboard/rooms#${encodeURIComponent(roomId)}`}
          className="text-xs font-medium text-accent hover:underline"
        >
          Xem chi tiết phòng
        </Link>
      </footer>
    </section>
  );
}