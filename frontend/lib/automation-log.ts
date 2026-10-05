/**
 * View-model for `GET /api/automations/:automationId/logs`.
 *
 * `getAutomationLogs` returns `unknown[]` because API_SPEC §11 leaves the
 * response body undefined (CONTRACT_GAPS G9). This module is the only place
 * that guesses, and it never throws: an unreadable entry becomes `null` so the
 * UI can say "chưa có lần chạy nào" instead of crashing.
 *
 * DATABASE_SPEC `automation_logs` is the shape the Backend is expected to send:
 * `id`, `automation_rule_id`, `command_id`, `execution_status`, `executed_at`,
 * `error_message`. Both snake_case and camelCase are accepted.
 */

export interface AutomationLogView {
  ranAt: string | null;
  ok: boolean | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const firstString = (row: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return null;
};

/** The most recent readable log entry, or null when the payload is unusable. */
export function readAutomationLog(raw: unknown): AutomationLogView | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    const ranAt = firstString(row, ["executed_at", "executedAt", "ran_at", "ranAt", "created_at"]);
    const status = firstString(row, [
      "execution_status",
      "executionStatus",
      "status",
      "command_status",
      "commandStatus",
    ]);
    const explicitOk =
      typeof row.success === "boolean"
        ? row.success
        : typeof row.ok === "boolean"
          ? row.ok
          : null;
    const ok = explicitOk ?? (status === null ? null : status === "SUCCESS");
    if (ranAt === null && status === null && ok === null) continue;
    return { ranAt, ok };
  }
  return null;
}

/** Index of the most recent log entry per automation id, for list rendering. */
export function readLatestAutomationLogs(
  logsByAutomation: Record<string, unknown[]>,
): Record<string, AutomationLogView> {
  const latest: Record<string, AutomationLogView> = {};
  for (const [automationId, raw] of Object.entries(logsByAutomation)) {
    const view = readAutomationLog(raw);
    if (view) latest[automationId] = view;
  }
  return latest;
}
