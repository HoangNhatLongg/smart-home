import { TelemetryChart } from "@/components/devices/TelemetryChart";
import { Section } from "@/components/ui/Section";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import type { TelemetryPoint } from "@/lib/api/contract";
import { formatDateTime, formatHumidity, formatTemperature } from "@/lib/format";

export function TelemetryPanel({
  points,
  loading = false,
}: {
  points: TelemetryPoint[];
  loading?: boolean;
}) {
  const latest = points[points.length - 1] ?? null;

  return (
    <Section
      title="Số đo môi trường"
      description="Nhiệt độ và độ ẩm mà thiết bị gửi lên gần nhất."
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-subtle">Nhiệt độ</dt>
          <dd className="mt-0.5 text-[15px] font-semibold text-ink">
            {formatTemperature(latest?.data.temperature ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">Độ ẩm</dt>
          <dd className="mt-0.5 text-[15px] font-semibold text-ink">
            {formatHumidity(latest?.data.humidity ?? null)}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <dt className="text-xs text-ink-subtle">Ghi nhận lúc</dt>
          <dd className="mt-0.5 text-[15px] font-medium text-ink">
            {formatDateTime(latest?.recordedAt ?? null)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        {loading && points.length === 0 ? (
          <div role="status" aria-label="Đang tải lịch sử số đo" className="rounded-lg border border-line bg-surface p-3">
            <span className="sr-only">Đang tải lịch sử số đo...</span>
            <SkeletonBlock rows={4} />
          </div>
        ) : (
          <TelemetryChart points={points} />
        )}
      </div>
    </Section>
  );
}