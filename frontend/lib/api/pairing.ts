import { request } from "./transport";

export async function pairDevice(input: { pairingCode: string; name: string; homeId: string; roomId: string; mqttUri: string }): Promise<void> {
  await request<unknown>("/api/devices/pair", { method: "POST", body: input });
}

export async function updateDeviceBroker(deviceId: string, mqttUri: string): Promise<void> {
  await request<unknown>(`/api/devices/${encodeURIComponent(deviceId)}/broker`, { method: "PUT", body: { mqttUri } });
}
