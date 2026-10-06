"use client";

import { Toggle } from "@/components/ui/Toggle";
import { Spinner } from "@/components/ui/Spinner";
import type { Device, DeviceCapability } from "@/lib/api/contract";
import type { CommandTrackerController } from "@/lib/hooks/useCommandTracker";

export interface RelayToggleProps {
  device: Device;
  capability: DeviceCapability;
  /** Current position read from GET /devices/:id/state. null = unknown. */
  value: boolean | null;
  tracker: CommandTrackerController;
  disabled?: boolean;
}

const RELAY_KIND_LABELS: Record<string, string> = {
  light: "Đèn", pump: "Bơm", fan: "Quạt", socket: "Ổ cắm", curtain: "Rèm", other: "Thiết bị khác",
};

/**
 * One relay instance (`relay_1`, `relay_2`, ...).
 *
 * The switch position comes from device State only. While a command is in flight
 * the switch is disabled and shows "Đang chờ thiết bị phản hồi..."; it is never
 * flipped optimistically from the POST response.
 */
export function RelayToggle({ device, capability, value, tracker, disabled = false }: RelayToggleProps) {
  // A node may expose several relay controls. Track the pending command by
  // both its node and relay instance so only the clicked switch shows loading.
  const mine = tracker.deviceId === device.deviceId && tracker.instanceCode === capability.instanceCode;
  const phase = mine ? tracker.status : "idle";
  const busy = phase === "sending" || phase === "waiting";
  const offline = device.status !== "online";
  const isDisabled = disabled || busy || offline;

  const statusLine = (() => {
    if (!mine || phase === "idle") return null;
    if (phase === "sending") return { tone: "text-ink-muted", text: "Đang gửi lệnh..." };
    if (phase === "waiting") return { tone: "text-accent", text: "Đang chờ thiết bị phản hồi..." };
    if (phase === "success") return { tone: "text-ok", text: "Thiết bị đã xác nhận." };
    if (phase === "failed") return { tone: "text-bad", text: tracker.error ?? "Thất bại." };
    return { tone: "text-warn", text: tracker.error ?? "Thiết bị không phản hồi." };
  })();

  const label = capability.name ?? `Relay ${capability.instanceCode.match(/\d+$/)?.[0] ?? ""}`;
  const kind = typeof capability.config?.kind === "string" ? capability.config.kind : null;
  const description = typeof capability.config?.description === "string" ? capability.config.description : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Toggle
        checked={value === true}
        disabled={isDisabled}
        label={`${label} (${capability.instanceCode})`}
        hint={value === null ? "Chưa có State, không hiển thị trạng thái" : undefined}
        onChange={(next) => {
          if (value === null) return;
          void tracker.requestRelay(device.deviceId, capability.instanceCode, next);
        }}
      />
      {(kind || description) && <p className="pl-14 text-xs text-ink-subtle">{[kind ? RELAY_KIND_LABELS[kind] ?? kind : null, description].filter(Boolean).join(" · ")}</p>}
      <p
        aria-live="polite"
        className="flex min-h-4 items-center gap-2 pl-14 text-xs text-ink-subtle"
      >
        {busy && <Spinner label="Đang chờ xác nhận" />}
        {statusLine ? <span className={statusLine.tone}>{statusLine.text}</span> : null}
        {!statusLine && offline ? <span className="text-bad">Thiết bị offline, không gửi lệnh.</span> : null}
      </p>
    </div>
  );
}

export function RelayControls({
  device,
  state,
  tracker,
}: {
  device: Device;
  state: Record<string, unknown> | null | undefined;
  tracker: CommandTrackerController;
}) {
  const relays = device.capabilities.filter(
    (capability) => capability.code === "relay" && capability.config?.configured !== false,
  );

  if (relays.length === 0) {
    return <p className="text-xs text-ink-subtle">Thiết bị không có relay.</p>;
  }

  return (
    <div className="space-y-3">
      {relays.map((capability) => {
        const raw = state?.[capability.instanceCode];
        const value = typeof raw === "boolean" ? raw : null;
        return (
          <RelayToggle
            key={capability.instanceCode}
            device={device}
            capability={capability}
            value={value}
            tracker={tracker}
          />
        );
      })}
    </div>
  );
}
