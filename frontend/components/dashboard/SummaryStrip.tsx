import { formatHumidity, formatTemperature } from "@/lib/format";
import { House, Cpu, MapPin, Thermometer } from "lucide-react";

export interface SummaryStripProps {
  homeCount: number;
  homeNames: string;
  online: number;
  deviceCount: number;
  roomCount: number;
  averageTemperature: number | null;
  averageHumidity: number | null;
  children?: React.ReactNode;
}

/**
 * Compact, information-first metrics sourced from the current device tree.
 */
export function SummaryStrip({
  homeCount,
  homeNames,
  online,
  deviceCount,
  roomCount,
  averageTemperature,
  averageHumidity,
  children,
}: SummaryStripProps) {
  const cells = [
    { label: "Ngôi nhà", value: String(homeCount), detail: homeNames || "Chưa thiết lập", icon: House, tone: "bg-blue-50 text-blue-700" },
    { label: "Phòng", value: String(roomCount), detail: roomCount === 1 ? "1 phòng đã tạo" : `${roomCount} phòng đã tạo`, icon: MapPin, tone: "bg-violet-50 text-violet-700" },
    { label: "Thiết bị", value: String(deviceCount), detail: `${online} đang trực tuyến`, icon: Cpu, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Môi trường · TB thiết bị trực tuyến", value: formatTemperature(averageTemperature), detail: `Độ ẩm ${formatHumidity(averageHumidity)}`, icon: Thermometer, tone: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cells.map((cell) => (
          <article key={cell.label} className="flex min-w-0 items-start gap-3 rounded-lg border border-line bg-surface p-4">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${cell.tone}`}><cell.icon size={19} strokeWidth={1.8} aria-hidden /></span>
            <dl className="min-w-0">
              <dt className="text-xs font-medium text-ink-subtle">{cell.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink">{cell.value}</dd>
              <dd className="mt-0.5 truncate text-xs text-ink-subtle">{cell.detail}</dd>
            </dl>
          </article>
        ))}
      </div>
      {children && <div className="flex items-center justify-end gap-2">{children}</div>}
    </div>
  );
}
