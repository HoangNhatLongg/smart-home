"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { OtaTable } from "@/components/ota/OtaTable";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import {
  ApiError,
  getOtaJob,
  isTerminalOtaStatus,
  listDeviceOtaJobs,
  listFirmware,
  startOta,
} from "@/lib/api";
import type { OtaJob } from "@/lib/api/contract";

const OTA_POLL_MS = 1500;

function formatFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortChecksum(checksum: string | null): string {
  if (!checksum) return "—";
  return checksum.length > 16 ? `${checksum.slice(0, 16)}…` : checksum;
}

export default function OtaPage() {
  const tree = useDeviceTree();
  const devices = tree.snapshot?.devices ?? [];
  const deviceKey = devices.map((device) => device.deviceId).join(",");

  const firmwareResource = usePollingResource(() => listFirmware(), { intervalMs: 300_000 });

  const jobsResource = usePollingResource(async () => {
    const entries = await Promise.all(
      devices.map(async (device) => {
        const jobs = await listDeviceOtaJobs(device.deviceId).catch(() => [] as OtaJob[]);
        const latest = [...jobs].sort(
          (left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""),
        )[0];
        return [device.deviceId, latest ?? null] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<string, OtaJob | null>;
  }, { intervalMs: 15_000, enabled: deviceKey !== "", deps: [deviceKey] });

  const [activeJob, setActiveJob] = useState<OtaJob | null>(null);
  const [startingDeviceId, setStartingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const jobs = useMemo<Record<string, OtaJob>>(() => {
    const merged: Record<string, OtaJob> = {};
    for (const [deviceId, job] of Object.entries(jobsResource.data ?? {})) {
      if (job) merged[deviceId] = job;
    }
    if (activeJob?.deviceId) merged[activeJob.deviceId] = activeJob;
    return merged;
  }, [jobsResource.data, activeJob]);

  const activeJobId = activeJob?.otaJobId ?? null;
  const { refresh: refreshTree } = tree;
  const { refresh: refreshJobs } = jobsResource;

  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const job = await getOtaJob(activeJobId).catch(() => null);
      if (cancelled) return;
      if (job) {
        setActiveJob(job);
        if (isTerminalOtaStatus(job.status)) {
          setActiveJob(null);
          refreshTree();
          refreshJobs();
          return;
        }
      }
      timer = setTimeout(() => void tick(), OTA_POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId, refreshTree, refreshJobs]);

  const onStart = async (deviceId: string, firmwareVersionId: string) => {
    setStartingDeviceId(deviceId);
    setError(null);
    try {
      const ack = await startOta(deviceId, firmwareVersionId);
      setActiveJob({
        otaJobId: ack.otaJobId,
        deviceId,
        firmwareVersionId,
        firmwareVersion: null,
        status: ack.status,
        progress: 0,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      });
      jobsResource.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không khởi tạo được quá trình cập nhật.");
    } finally {
      setStartingDeviceId(null);
    }
  };

  const firmware = firmwareResource.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cập nhật phần mềm"
        description="Bạn chủ động chọn thiết bị và phiên bản để cài. Thiết bị cập nhật xong mới dùng được."
        meta={<PollBadge updatedAt={firmwareResource.lastUpdatedAt} busy={firmwareResource.loading} />}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              jobsResource.refresh();
              firmwareResource.refresh();
            }}
            icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
          >
            Làm mới
          </Button>
        }
      />

      <section className="rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Phiên bản khả dụng</h2>
        </header>
        <div className="p-4">
          <DataState
            loading={firmwareResource.loading}
            error={firmwareResource.error}
            onRetry={firmwareResource.refresh}
            isEmpty={firmware.length === 0}
            emptyMessage="Chưa có gói cập nhật nào."
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {firmware.map((item) => (
                <li key={item.id} className="rounded-md border border-line bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-ink">{item.version}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {item.releaseNote ?? "Không có ghi chú phát hành."}
                  </p>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                    <div className="flex items-baseline gap-1.5">
                      <dt>Dung lượng</dt>
                      <dd>{formatFileSize(item.fileSize)}</dd>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <dt>Kiểm tra</dt>
                      <dd className="font-mono">{shortChecksum(item.checksum)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </DataState>
        </div>
      </section>

      <DataState
        loading={tree.status === "loading" && tree.snapshot === null}
        error={tree.error}
        onRetry={tree.refresh}
        isEmpty={devices.length === 0}
        emptyMessage="Chưa có thiết bị nào để cập nhật."
      >
        <OtaTable
          devices={devices}
          firmware={firmware}
          jobs={jobs}
          startingDeviceId={startingDeviceId}
          onStart={(deviceId, firmwareVersionId) => void onStart(deviceId, firmwareVersionId)}
        />
      </DataState>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}