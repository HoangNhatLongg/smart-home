import { formatHumidity, formatTemperature } from "@/lib/format";

export interface SummaryStripProps {
  homeName: string | null;
  online: number;
  deviceCount: number;
  roomCount: number;
  averageTemperature: number | null;
  averageHumidity: number | null;
  children?: React.ReactNode;
}

/**
 * One horizontal band instead of a row of stat cards. Values are separated by
 * hairlines so the numbers read as a single summary, not five widgets.
 */
export function SummaryStrip({
  homeName,
  online,
  deviceCount,
  roomCount,
  averageTemperature,
  averageHumidity,
  children,
}: SummaryStripProps) {
  const cells = [
    { label: "Thiết bị hoạt động", value: `${online}/${deviceCount}` },
    { label: "Phòng", value: String(roomCount) },
    { label: "Nhiệt độ trung bình", value: formatTemperature(averageTemperature) },
    { label: "Độ ẩm trung bình", value: formatHumidity(averageHumidity) },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:gap-0">
      <p className="min-w-0 shrink-0 pr-4 text-sm font-semibold text-ink sm:w-44">
        {homeName ?? "Chưa có nhà"}
      </p>
      <dl className="grid flex-1 grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {cells.map((cell) => (
          <div key={cell.label} className="px-2 py-1.5 sm:px-4">
            <dt className="text-xs text-ink-subtle">{cell.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink">{cell.value}</dd>
          </div>
        ))}
      </dl>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}