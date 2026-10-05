"use client";

import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/components/ui/Toaster";
import type { Device, DeviceState } from "@/lib/api/contract";
import type { CommandTrackerController } from "@/lib/hooks/useCommandTracker";

export interface CommandFeedbackProps {
  tracker: CommandTrackerController;
  /** Confirmed device State, keyed by human deviceId. */
  states: Record<string, DeviceState | null>;
  /** Used only to look up the relay display name. */
  devices: Device[];
}

/**
 * Renders nothing. Turns a settled command into a toast.
 *
 * The message never guesses the new position: `success` only ever happens after
 * `GET /api/commands/:id` reported SUCCESS, and the position is read from the
 * confirmed State that the same tracker refresh produced.
 */
export function CommandFeedback({ tracker, states, devices }: CommandFeedbackProps) {
  const { notify } = useToast();
  const handledSettledAt = useRef<number | null>(null);

  const relayNames = useMemo(
    () =>
      Object.fromEntries(
        devices.map((device) => [
          device.deviceId,
          Object.fromEntries(
            device.capabilities
              .filter((capability) => capability.code === "relay")
              .map((capability) => [
                capability.instanceCode,
                capability.name ?? capability.instanceCode,
              ]),
          ),
        ]),
      ) as Record<string, Record<string, string>>,
    [devices],
  );

  const status = tracker.status;
  const settledAt = tracker.settledAt;

  useEffect(() => {
    if (settledAt === null) return;
    if (handledSettledAt.current === settledAt) return;
    if (status !== "success" && status !== "failed" && status !== "timeout") return;
    handledSettledAt.current = settledAt;

    if (status === "success") {
      const deviceId = tracker.deviceId;
      const instanceCode = tracker.instanceCode;
      if (!deviceId || !instanceCode) {
        notify({ message: "Thiết bị đã xác nhận lệnh.", tone: "success" });
        return;
      }
      const raw = states[deviceId]?.state?.[instanceCode];
      const position = typeof raw === "boolean" ? (raw ? "bật" : "tắt") : null;
      const name = relayNames[deviceId]?.[instanceCode] ?? instanceCode;
      notify({
        message: position ? `Đã ${position} ${name}.` : `Thiết bị đã xác nhận ${name}.`,
        tone: "success",
      });
      return;
    }

    if (status === "failed") {
      notify({ message: tracker.error ?? "Lệnh không thực hiện được.", tone: "error" });
      return;
    }

    notify({ message: "Chưa có xác nhận từ thiết bị.", tone: "warning" });
  }, [status, settledAt, tracker.deviceId, tracker.instanceCode, tracker.error, states, relayNames, notify]);

  return null;
}