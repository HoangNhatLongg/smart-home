import { request } from "./transport";
import { segment } from "./client";
import { normalizeConfiguration } from "./normalize";
import type { DeviceConfiguration } from "./contract";

/** GET /api/devices/:deviceId/configuration — API_SPEC §10. */
export async function getConfiguration(deviceId: string): Promise<DeviceConfiguration> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/configuration`);
  return normalizeConfiguration(payload, deviceId);
}

/**
 * GET /api/devices/:deviceId/configuration/status — API_SPEC §10.
 * Returns desired and applied configuration so the UI can show "Applying..."
 * while the ESP32 has not reported the applied config yet.
 */
export async function getConfigurationStatus(deviceId: string): Promise<DeviceConfiguration> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/configuration/status`);
  return normalizeConfiguration(payload, deviceId);
}

/**
 * PUT /api/devices/:deviceId/configuration — API_SPEC §10.
 * Keys inside the body are device configuration keys (`telemetry_interval`,
 * `relay_1_name`), not API field names, so they are sent verbatim.
 */
export async function updateConfiguration(
  deviceId: string,
  configuration: Record<string, unknown>,
): Promise<DeviceConfiguration> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/configuration`, {
    method: "PUT",
    body: configuration,
  });
  return normalizeConfiguration(payload, deviceId);
}