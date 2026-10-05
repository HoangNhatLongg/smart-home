import { request } from "./transport";
import { segment } from "./client";
import { normalizeFirmwareVersions, normalizeOtaJob, normalizeOtaJobs } from "./normalize";
import type { FirmwareVersion, OtaJob, OtaStatus } from "./contract";

/** GET /api/firmware — API_SPEC §12. */
export async function listFirmware(): Promise<FirmwareVersion[]> {
  return normalizeFirmwareVersions(await request<unknown>("/api/firmware"));
}

/** GET /api/devices/:deviceId/ota — API_SPEC §12. */
export async function listDeviceOtaJobs(deviceId: string): Promise<OtaJob[]> {
  return normalizeOtaJobs(await request<unknown>(`/api/devices/${segment(deviceId)}/ota`));
}

/**
 * POST /api/devices/:deviceId/ota — API_SPEC §12.
 * OTA is user-initiated only (SYSTEM_SPEC §12); nothing in this Frontend ever
 * triggers an update on its own.
 */
export async function startOta(
  deviceId: string,
  firmwareVersionId: string,
): Promise<{ otaJobId: string; status: OtaStatus }> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/ota`, {
    method: "POST",
    body: { firmwareVersionId },
  });
  const job = normalizeOtaJob(payload);
  if (!job) throw new Error("Phản hồi OTA không hợp lệ.");
  return { otaJobId: job.otaJobId, status: job.status };
}

/** GET /api/ota/:jobId — API_SPEC §12. */
export async function getOtaJob(jobId: string): Promise<OtaJob | null> {
  return normalizeOtaJob(await request<unknown>(`/api/ota/${segment(jobId)}`));
}