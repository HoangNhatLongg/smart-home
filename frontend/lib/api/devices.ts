import { request } from "./transport";
import { segment } from "./client";
import { asArray, normalizeDevice, normalizeDeviceCapability, normalizeDeviceState } from "./normalize";
import type { Device, DeviceCapability, DeviceState } from "./contract";

/** GET /api/devices/:deviceId — API_SPEC §5. */
export async function getDevice(deviceId: string): Promise<Device | null> {
  return normalizeDevice(await request<unknown>(`/api/devices/${segment(deviceId)}`));
}

/** POST /api/rooms/:roomId/devices — API_SPEC §5 provisioning endpoint. */
export async function createDevice(roomId: string, deviceId: string, name: string): Promise<Device | null> {
  return normalizeDevice(
    await request<unknown>(`/api/rooms/${segment(roomId)}/devices`, {
      method: "POST",
      body: { deviceId, name },
    }),
  );
}

/** PUT /api/devices/:deviceId — API_SPEC §5 (editable fields: name). */
export async function updateDeviceName(deviceId: string, name: string): Promise<Device | null> {
  return normalizeDevice(
    await request<unknown>(`/api/devices/${segment(deviceId)}`, {
      method: "PUT",
      body: { name },
    }),
  );
}

/** DELETE /api/devices/:deviceId — revoke the pairing. */
export async function deleteDevice(deviceId: string): Promise<void> {
  await request<unknown>(`/api/devices/${segment(deviceId)}`, { method: "DELETE" });
}

/** GET /api/devices/:deviceId/capabilities — API_SPEC §6. */
export async function listDeviceCapabilities(deviceId: string): Promise<DeviceCapability[]> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/capabilities`);
  return asArray(payload, "capabilities")
    .map(normalizeDeviceCapability)
    .filter((item): item is DeviceCapability => item !== null);
}

/** GET /api/capabilities/registry — API_SPEC §6. */
export async function listCapabilityRegistry(): Promise<DeviceCapability[]> {
  const payload = await request<unknown>("/api/capabilities/registry");
  return asArray(payload, "capabilities", "registry")
    .map(normalizeDeviceCapability)
    .filter((item): item is DeviceCapability => item !== null);
}

/**
 * GET /api/devices/:deviceId/state — API_SPEC §8.
 * This is the only source of truth for a toggle's rendered position
 * (SYSTEM_SPEC rule 7: only a matching State confirms a command).
 */
export async function getDeviceState(deviceId: string): Promise<DeviceState> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/state`);
  return normalizeDeviceState(payload, deviceId);
}
