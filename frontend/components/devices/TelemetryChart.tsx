"use client";

import { formatNumber, formatTime } from "@/lib/format";
import type { TelemetryPoint } from "@/lib/api/contract";

const WIDTH = 640;
const HEIGHT = 200;
const PAD_X = 34;
const PAD_Y = 18;

const GRID = "#e4e7ec";
const AXIS_TEXT = "#667085";

export interface TelemetrySeries {
  key: string;
  label: string;
  color: string;
}

export const DEFAULT_SERIES: TelemetrySeries[] = [
  { key: "temperature", label: "Nhiệt độ", color: "#175cd3" },
  { key: "humidity", label: "Độ ẩm", color: "#067647" },
];

/**
 * Dependency-free SVG line chart. Only rendered when the Backend actually
 * returned enough points; no chart library is added to the project.
 */
export function TelemetryChart({
  points,
  series = DEFAULT_SERIES,
}: {
  points: TelemetryPoint[];
  series?: TelemetrySeries[];
}) {
  if (points.length < 3) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface-muted p-4 text-xs text-ink-subtle">
        Chưa đủ dữ liệu để vẽ biểu đồ (cần ít nhất 3 điểm).
      </p>
    );
  }

  const count = points.length;
  const x = (index: number) =>
    PAD_X + (index * (WIDTH - PAD_X * 2)) / Math.max(1, count - 1);

  const built = series.map((item) => {
    const values = points.map((point) => point.data[item.key]);
    const numbers = values.filter((value): value is number => typeof value === "number");
    const min = numbers.length ? Math.min(...numbers) : 0;
    const max = numbers.length ? Math.max(...numbers) : 1;
    const span = max - min || 1;
    const y = (value: number) =>
      HEIGHT - PAD_Y - ((value - min) / span) * (HEIGHT - PAD_Y * 2);
    const path = values
      .map((value, index) =>
        typeof value === "number" ? `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}` : null,
      )
      .filter((segment): segment is string => segment !== null)
      .join(" ");
    return { ...item, min, max, path, hasData: numbers.length > 0 };
  });

  const drawn = built.filter((item) => item.hasData);
  const first = points[0];
  const middle = points[Math.floor((count - 1) / 2)];
  const last = points[count - 1];

  return (
    <figure className="rounded-lg border border-line bg-surface p-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Biểu đồ nhiệt độ và độ ẩm theo thời gian"
        className="h-auto w-full"
      >
        <line x1={PAD_X} y1={PAD_Y} x2={PAD_X} y2={HEIGHT - PAD_Y} stroke={GRID} strokeWidth={1} />
        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_Y}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_Y}
          stroke={GRID}
          strokeWidth={1}
        />
        <line
          x1={PAD_X}
          y1={(HEIGHT / 2).toFixed(1)}
          x2={WIDTH - PAD_X}
          y2={(HEIGHT / 2).toFixed(1)}
          stroke={GRID}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        {drawn.map((item) => (
          <path key={item.key} d={item.path} fill="none" stroke={item.color} strokeWidth={2} />
        ))}
        {drawn.map((item) => (
          <text key={`${item.key}-max`} x={4} y={PAD_Y + 4} fill={item.color} fontSize={10}>
            {formatNumber(item.max)}
          </text>
        ))}
        {drawn.map((item) => (
          <text
            key={`${item.key}-min`}
            x={4}
            y={HEIGHT - PAD_Y + 4}
            fill={item.color}
            fontSize={10}
          >
            {formatNumber(item.min)}
          </text>
        ))}
        <text x={PAD_X} y={HEIGHT - 4} fill={AXIS_TEXT} fontSize={10} textAnchor="start">
          {formatTime(first.recordedAt)}
        </text>
        <text x={WIDTH / 2} y={HEIGHT - 4} fill={AXIS_TEXT} fontSize={10} textAnchor="middle">
          {formatTime(middle.recordedAt)}
        </text>
        <text
          x={WIDTH - PAD_X}
          y={HEIGHT - 4}
          fill={AXIS_TEXT}
          fontSize={10}
          textAnchor="end"
        >
          {formatTime(last.recordedAt)}
        </text>
      </svg>
      <figcaption className="mt-2.5 flex flex-wrap gap-4 text-xs text-ink-subtle">
        {built.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}