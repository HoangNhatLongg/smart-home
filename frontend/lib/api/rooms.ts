import { request } from "./transport";
import { segment } from "./client";
import { normalizeDevices, normalizeRoom, normalizeRooms } from "./normalize";
import type { Device, Room } from "./contract";

/** GET /api/homes/:homeId/rooms — API_SPEC §4. */
export async function listRooms(homeId: string): Promise<Room[]> {
  return normalizeRooms(await request<unknown>(`/api/homes/${segment(homeId)}/rooms`));
}

/** POST /api/homes/:homeId/rooms — API_SPEC §4. */
export async function createRoom(homeId: string, name: string): Promise<Room | null> {
  return normalizeRoom(
    await request<unknown>(`/api/homes/${segment(homeId)}/rooms`, {
      method: "POST",
      body: { name },
    }),
  );
}

/** PUT /api/rooms/:roomId — API_SPEC §4. */
export async function updateRoom(roomId: string, name: string): Promise<Room | null> {
  return normalizeRoom(
    await request<unknown>(`/api/rooms/${segment(roomId)}`, {
      method: "PUT",
      body: { name },
    }),
  );
}

/** DELETE /api/rooms/:roomId — API_SPEC §4. */
export async function deleteRoom(roomId: string): Promise<void> {
  await request<unknown>(`/api/rooms/${segment(roomId)}`, { method: "DELETE" });
}

/** GET /api/rooms/:roomId/devices — API_SPEC §5. */
export async function listRoomDevices(roomId: string): Promise<Device[]> {
  return normalizeDevices(await request<unknown>(`/api/rooms/${segment(roomId)}/devices`));
}