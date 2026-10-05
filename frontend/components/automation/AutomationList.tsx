"use client";

import { AutomationCard } from "@/components/automation/AutomationCard";
import type { Automation, Device } from "@/lib/api/contract";
import type { AutomationLogView } from "@/lib/automation-log";

export function AutomationList({
  automations,
  devices,
  lastRuns,
  deletingId,
  onEdit,
  onDelete,
}: {
  automations: Automation[];
  devices: Device[];
  lastRuns: Record<string, AutomationLogView>;
  deletingId: string | null;
  onEdit: (automation: Automation) => void;
  onDelete: (automation: Automation) => void;
}) {
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {automations.map((automation) => (
        <li key={automation.id}>
          <AutomationCard
            automation={automation}
            deviceName={
              devices.find((device) => device.deviceId === automation.action.deviceId)?.name ?? null
            }
            lastRun={lastRuns[automation.id] ?? null}
            deleting={deletingId === automation.id}
            onEdit={() => onEdit(automation)}
            onDelete={() => onDelete(automation)}
          />
        </li>
      ))}
    </ul>
  );
}