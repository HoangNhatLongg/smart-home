import { request } from "./transport";
import { segment } from "./client";
import { normalizeTelemetry } from "./normalize";
import type { TelemetryPoint, TimeRange } from "./contract";

/**
 * GET /api/devices/:deviceId/telemetry — API_SPEC §7.
 * Only `limit`, `from` and `to` exist in the contract; no cursor, no page.
 */
export async function getTelemetry(
  deviceId: string,
  options: { limit?: number } & TimeRange = {},
): Promise<TelemetryPoint[]> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/telemetry`, {
    query: { limit: options.limit, from: options.from, to: options.to },
  });
  return normalizeTelemetry(payload);
}