import { request } from "./transport";
import { segment } from "./client";
import { normalizeCommand, normalizeCommandAck, normalizeStateHistory } from "./normalize";
import type {
  Command,
  CommandStatus,
  StateHistoryEntry,
  TimeRange,
} from "./contract";

export interface CommandAck {
  commandId: string;
  /** Status at creation time. `SUCCESS` here still has to be re-checked via GET. */
  status: CommandStatus;
}

/**
 * POST /api/devices/:deviceId/commands — API_SPEC §9.
 *
 * API_SPEC is the Frontend↔Backend contract, so the body uses camelCase
 * (`commandType`, `payload.capability`); the normalizers also read the
 * snake_case spelling used in DATABASE_SPEC.
 *
 * IMPORTANT: a 200/202 response means the command record exists, nothing more.
 * Callers must poll `getCommand` and treat only a terminal SUCCESS as
 * "the device confirmed" (SYSTEM_SPEC rule 7).
 */
export async function sendRelayCommand(
  deviceId: string,
  instanceCode: string,
  state: boolean,
): Promise<CommandAck> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/commands`, {
    method: "POST",
    body: { commandType: "set_relay", payload: { capability: instanceCode, state } },
  });
  const ack = normalizeCommandAck(payload);
  if (!ack) throw new Error("Phản hồi command không hợp lệ.");
  return ack;
}

/** GET /api/commands/:commandId — API_SPEC §9. */
export async function getCommand(commandId: string): Promise<Command | null> {
  return normalizeCommand(await request<unknown>(`/api/commands/${segment(commandId)}`));
}

/** GET /api/devices/:deviceId/state-history — API_SPEC §8. */
export async function getStateHistory(
  deviceId: string,
  options: { limit?: number } & TimeRange = {},
): Promise<StateHistoryEntry[]> {
  const payload = await request<unknown>(`/api/devices/${segment(deviceId)}/state-history`, {
    query: { limit: options.limit, from: options.from, to: options.to },
  });
  return normalizeStateHistory(payload);
}