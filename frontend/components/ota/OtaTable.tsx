"use client";

import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OtaJobStatus } from "@/components/ota/OtaJobStatus";
import type { Device, FirmwareVersion, OtaJob } from "@/lib/api/contract";

export interface OtaTableProps {
  devices: Device[];
  firmware: FirmwareVersion[];
  jobs: Record<string, OtaJob>;
  startingDeviceId: string | null;
  onStart: (deviceId: string, firmwareVersionId: string) => void;
}

export function OtaTable({ devices, firmware, jobs, startingDeviceId, onStart }: OtaTableProps) {
  const latest = firmware.reduce<FirmwareVersion | null>((best, item) => {
    if (!best) return item;
    return item.version.localeCompare(best.version, undefined, { numeric: true }) > 0 ? item : best;
  }, null);

  const rowState = (device: Device) => {
    const job = jobs[device.deviceId];
    const jobRunning = job !== undefined && job.status !== "SUCCESS" && job.status !== "FAILED";
    const upToDate =
      latest !== null &&
      device.firmwareVersion !== null &&
      device.firmwareVersion === latest.version;
    return { job, jobRunning, upToDate };
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <table className="hidden w-full text-left text-sm lg:table">
        <thead className="border-b border-line-strong bg-surface-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Thiết bị</th>
            <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Đang chạy</th>
            <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Có bản mới</th>
            <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Kết nối</th>
            <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Tiến độ</th>
            <th scope="col" className="px-4 py-2.5 text-xs font-medium text-ink-muted">Hành động</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {devices.map((device) => {
            const { job, jobRunning, upToDate } = rowState(device);
            return (
              <tr key={device.deviceId}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{device.name}</p>
                  <p className="text-xs text-ink-subtle">{device.deviceId}</p>
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{device.firmwareVersion ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-muted">{latest?.version ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={device.status} />
                </td>
                <td className="px-4 py-2.5">
                  {job ? (
                    <OtaJobStatus job={job} />
                  ) : (
                    <span className="text-xs text-ink-subtle">Chưa cập nhật</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Button
                    size="sm"
                    disabled={
                      latest === null ||
                      upToDate ||
                      jobRunning ||
                      startingDeviceId === device.deviceId ||
                      device.status !== "online"
                    }
                    onClick={() => latest && onStart(device.deviceId, latest.id)}
                  >
                    {jobRunning ? "Đang cập nhật" : "Cập nhật"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-line lg:hidden">
        {devices.map((device) => {
          const { job, jobRunning, upToDate } = rowState(device);
          return (
            <li key={device.deviceId} className="space-y-2.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{device.name}</p>
                  <p className="truncate text-xs text-ink-subtle">{device.deviceId}</p>
                </div>
                <StatusBadge status={device.status} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-ink-subtle">Đang chạy</dt>
                  <dd className="text-ink-muted">{device.firmwareVersion ?? "—"}</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-ink-subtle">Có bản mới</dt>
                  <dd className="text-ink-muted">{latest?.version ?? "—"}</dd>
                </div>
              </dl>

              {job && <OtaJobStatus job={job} />}

              <Button
                size="sm"
                disabled={
                  latest === null ||
                  upToDate ||
                  jobRunning ||
                  startingDeviceId === device.deviceId ||
                  device.status !== "online"
                }
                onClick={() => latest && onStart(device.deviceId, latest.id)}
              >
                {jobRunning ? "Đang cập nhật" : "Cập nhật"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}