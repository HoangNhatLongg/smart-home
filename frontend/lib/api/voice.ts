import { request } from "./transport";
import { normalizeVoiceResult } from "./normalize";
import type { VoiceCommandResult } from "./contract";

/**
 * POST /api/voice/command — API_SPEC §13.
 *
 * For control, `success: true` means the Backend received matching State.
 * A pending command returns success:false with commandId for later tracking.
 */
export async function sendVoiceCommand(text: string): Promise<VoiceCommandResult> {
  return normalizeVoiceResult(
    await request<unknown>("/api/voice/command", { method: "POST", body: { text }, timeoutMs: 90_000 }),
  );
}
