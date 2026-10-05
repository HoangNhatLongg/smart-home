import Link from "next/link";
import { ChevronRight, DoorOpen, Droplets, Thermometer } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { telemetryValueOf } from "@/lib/hooks/useDeviceTree";
import { formatHumidity, formatTemperature } from "@/lib/format";
import type { Device, TelemetryPoint } from "@/lib/api/contract";

export function RoomOverviewCard({
  roomId,
  roomName,
  devices,
  telemetry,
}: {
  roomId: string;
  roomName: string;
  devices: Device[];
  telemetry: Record<string, TelemetryPoint | null>;
}) {
  const online = devices.filter((device) => device.status === "online").length;
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const temperatures = devices
    .map((device) => telemetryValueOf(telemetry[device.deviceId], "temperature"))
    .filter((value): value is number => value !== null);
  const humidities = devices
    .map((device) => telemetryValueOf(telemetry[device.deviceId], "humidity"))
    .filter((value): value is number => value !== null);

  return (
    <article className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent-subtle text-accent">
          <DoorOpen size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <StatusBadge status={online > 0 ? "online" : devices.length ? "offline" : "unknown"} />
      </div>
      <h2 className="mt-4 text-[15px] font-semibold text-ink">{roomName}</h2>
      <p className="mt-1 text-xs text-ink-subtle">
        {devices.length} thiết bị · {online} trực tuyến
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-1.5 text-sm text-ink">
          <Thermometer size={15} strokeWidth={1.8} className="text-bad" aria-hidden />
          <dd>{formatTemperature(average(temperatures))}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-ink">
          <Droplets size={15} strokeWidth={1.8} className="text-info" aria-hidden />
          <dd>{formatHumidity(average(humidities))}</dd>
        </div>
      </dl>
      <Link href={`/dashboard/rooms#${encodeURIComponent(roomId)}`} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
        Xem phòng <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </article>
  );
}
