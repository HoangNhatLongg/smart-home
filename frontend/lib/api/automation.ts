import { request } from "./transport";
import { segment } from "./client";
import { asArray, normalizeAutomation, normalizeAutomations } from "./normalize";
import type { Automation } from "./contract";

/** GET /api/homes/:homeId/automations — API_SPEC §11. */
export async function listAutomations(homeId: string): Promise<Automation[]> {
  return normalizeAutomations(await request<unknown>(`/api/homes/${segment(homeId)}/automations`));
}

/** POST /api/homes/:homeId/automations — API_SPEC §11 (camelCase `action.deviceId`). */
export async function createAutomation(
  homeId: string,
  input: {
    name: string;
    enabled: boolean;
    schedule: Automation["schedule"];
    action: { deviceId: string; capability: string; command: string; params: Record<string, unknown> };
  },
): Promise<Automation | null> {
  return normalizeAutomation(
    await request<unknown>(`/api/homes/${segment(homeId)}/automations`, {
      method: "POST",
      body: input,
    }),
  );
}

/** PUT /api/automations/:id — API_SPEC §11. */
export async function updateAutomation(
  automationId: string,
  input: Partial<Pick<Automation, "name" | "enabled" | "schedule" | "action">>,
): Promise<Automation | null> {
  return normalizeAutomation(
    await request<unknown>(`/api/automations/${segment(automationId)}`, {
      method: "PUT",
      body: input,
    }),
  );
}

/** DELETE /api/automations/:id — API_SPEC §11. */
export async function deleteAutomation(automationId: string): Promise<void> {
  await request<unknown>(`/api/automations/${segment(automationId)}`, { method: "DELETE" });
}

/** GET /api/automations/:id/logs — API_SPEC §11. Response body is undefined (G9). */
export async function getAutomationLogs(automationId: string): Promise<unknown[]> {
  return asArray(await request<unknown>(`/api/automations/${segment(automationId)}/logs`), "logs");
}
