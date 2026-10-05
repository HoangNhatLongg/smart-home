import { otaStatusLabel } from "@/lib/format";
import type { OtaJob } from "@/lib/api/contract";

const TONE: Record<OtaJob["status"], string> = {
  PENDING: "text-ink-muted",
  DOWNLOADING: "text-info",
  INSTALLING: "text-info",
  REBOOTING: "text-warn",
  SUCCESS: "text-ok",
  FAILED: "text-bad",
};

const DONE = (status: OtaJob["status"]) => status === "SUCCESS" || status === "FAILED";

export function OtaJobStatus({ job }: { job: OtaJob }) {
  const progress = job.progress === null ? null : Math.max(0, Math.min(100, job.progress));

  return (
    <div className="space-y-1.5">
      <p className={`text-xs font-medium ${TONE[job.status]}`}>
        {otaStatusLabel(job.status)}
        {job.firmwareVersion ? ` · ${job.firmwareVersion}` : ""}
      </p>
      {progress !== null && !DONE(job.status) && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tiến độ cập nhật"
          className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      )}
      {job.status === "SUCCESS" && progress !== null && (
        <div
          role="progressbar"
          aria-valuenow={100}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tiến độ cập nhật"
          className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full w-full bg-ok-dot" />
        </div>
      )}
      {job.errorMessage && <p className="text-xs text-bad">{job.errorMessage}</p>}
    </div>
  );
}