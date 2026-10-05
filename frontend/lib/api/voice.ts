import { request } from "./transport";
import { normalizeVoiceResult } from "./normalize";
import type { VoiceCommandResult } from "./contract";

/**
 * POST /api/voice/command — API_SPEC §13.
 *
 * `success: true` means the intent was resolved and a Backend command was
 * created. It is NOT a device confirmation (SYSTEM_SPEC rule 8), so the returned
 * `commandId` must be polled through `getCommand` before reporting success.
 */
export async function sendVoiceCommand(text: string): Promise<VoiceCommandResult> {
  return normalizeVoiceResult(
    await request<unknown>("/api/voice/command", { method: "POST", body: { text } }),
  );
}