"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ApiError } from "@/lib/api/client";
import { getCommand, isTerminalCommandStatus, sendRelayCommand } from "@/lib/api";
import type { CommandStatus } from "@/lib/api/contract";

export type CommandTrackerStatus =
  | "idle"
  | "sending"
  | "waiting"
  | "success"
  | "failed"
  | "timeout";

export interface CommandTrackerState {
  status: CommandTrackerStatus;
  deviceId: string | null;
  instanceCode: string | null;
  commandId: string | null;
  error: string | null;
  /** Backend command status, only meaningful from `ack` onwards. */
  commandStatus: CommandStatus | null;
  settledAt: number | null;
}

export type CommandTrackerAction =
  | { type: "send"; deviceId: string; instanceCode: string }
  | { type: "ack"; commandId: string; status: CommandStatus }
  | { type: "adopt"; commandId: string; deviceId?: string | null }
  | { type: "settle"; status: CommandStatus; error?: string | null }
  | { type: "deadline" }
  | { type: "error"; message: string }
  | { type: "reset" };

export const NO_DEVICE_RESPONSE = "Thiết bị không phản hồi.";

export const initialCommandTrackerState: CommandTrackerState = {
  status: "idle",
  deviceId: null,
  instanceCode: null,
  commandId: null,
  error: null,
  commandStatus: null,
  settledAt: null,
};

/**
 * Pure state machine for one relay command.
 *
 * `idle -> sending -> waiting -> success | failed | timeout`
 *
 * A successful POST only produces `waiting`. `success` is reachable exclusively
 * through `settle` with a terminal SUCCESS from `GET /api/commands/:commandId`,
 * which is the Frontend's view of "the device confirmed with a matching State"
 * (SYSTEM_SPEC rule 7).
 */
export function commandTrackerReducer(
  state: CommandTrackerState,
  action: CommandTrackerAction,
): CommandTrackerState {
  switch (action.type) {
    case "send":
      return {
        ...initialCommandTrackerState,
        status: "sending",
        deviceId: action.deviceId,
        instanceCode: action.instanceCode,
      };
    case "ack":
      return {
        ...state,
        status: "waiting",
        commandId: action.commandId,
        commandStatus: action.status,
        error: null,
      };
    case "adopt":
      return {
        ...state,
        status: "waiting",
        commandId: action.commandId,
        deviceId: action.deviceId ?? state.deviceId,
        commandStatus: "PENDING",
        error: null,
      };
    case "settle": {
      if (state.status !== "waiting" && state.status !== "sending") return state;
      if (action.status === "SUCCESS") {
        return {
          ...state,
          status: "success",
          commandStatus: "SUCCESS",
          error: null,
          settledAt: Date.now(),
        };
      }
      if (action.status === "TIMEOUT") {
        return {
          ...state,
          status: "timeout",
          commandStatus: "TIMEOUT",
          error: action.error ?? NO_DEVICE_RESPONSE,
          settledAt: Date.now(),
        };
      }
      return {
        ...state,
        status: "failed",
        commandStatus: "FAILED",
        error: action.error ?? "Thiết bị không thực thi được lệnh.",
        settledAt: Date.now(),
      };
    }
    case "deadline": {
      if (state.status !== "waiting") return state;
      return {
        ...state,
        status: "timeout",
        error: NO_DEVICE_RESPONSE,
        settledAt: Date.now(),
      };
    }
    case "error":
      if (state.status !== "waiting" && state.status !== "sending") return state;
      return { ...state, status: "failed", error: action.message, settledAt: Date.now() };
    case "reset":
      return initialCommandTrackerState;
    default:
      return state;
  }
}

const readNumberEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const commandPollIntervalMs = (): number =>
  readNumberEnv(process.env.NEXT_PUBLIC_COMMAND_POLL_INTERVAL_MS, 1500);

export const commandDeadlineMs = (): number =>
  readNumberEnv(process.env.NEXT_PUBLIC_COMMAND_DEADLINE_MS, 60_000);

export interface CommandTrackerOptions {
  intervalMs?: number;
  deadlineMs?: number;
  /** Called after a confirmed SUCCESS so the caller can re-read device state. */
  onConfirmed?: (deviceId: string) => void;
}

export interface CommandTrackerController extends CommandTrackerState {
  busy: boolean;
  requestRelay: (deviceId: string, instanceCode: string, nextState: boolean) => Promise<void>;
  /** Track a command created elsewhere (for example by POST /api/voice/command). */
  track: (commandId: string, deviceId?: string | null) => void;
  reset: () => void;
}

export function useCommandTracker(options: CommandTrackerOptions = {}): CommandTrackerController {
  const { onConfirmed } = options;
  const intervalMs = options.intervalMs ?? commandPollIntervalMs();
  const deadlineMs = options.deadlineMs ?? commandDeadlineMs();
  const [state, dispatch] = useReducer(commandTrackerReducer, initialCommandTrackerState);
  const confirmedRef = useRef(onConfirmed);
  useEffect(() => {
    confirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const commandId = state.commandId;
  const waiting = state.status === "waiting";

  useEffect(() => {
    if (!waiting || !commandId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const schedule = (delayMs: number) => {
      timer = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const command = await getCommand(commandId);
        if (cancelled) return;
        if (command && isTerminalCommandStatus(command.status)) {
          dispatch({ type: "settle", status: command.status, error: command.errorMessage });
          return;
        }
        if (Date.now() - startedAt >= deadlineMs) {
          dispatch({ type: "deadline" });
          return;
        }
        schedule(Math.min(intervalMs, Math.max(0, deadlineMs - (Date.now() - startedAt))));
      } catch (cause) {
        if (cancelled) return;
        if (Date.now() - startedAt >= deadlineMs) {
          dispatch({ type: "deadline" });
          return;
        }
        dispatch({
          type: "error",
          message: cause instanceof ApiError ? cause.message : "Không đọc được trạng thái command.",
        });
        schedule(intervalMs);
      }
    };

    schedule(intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [commandId, waiting, intervalMs, deadlineMs]);

  const settled = state.status;
  useEffect(() => {
    if (settled === "success" && state.deviceId) confirmedRef.current?.(state.deviceId);
  }, [settled, state.deviceId]);

  const requestRelay = useCallback(
    async (deviceId: string, instanceCode: string, nextState: boolean) => {
      dispatch({ type: "send", deviceId, instanceCode });
      try {
        const ack = await sendRelayCommand(deviceId, instanceCode, nextState);
        dispatch({ type: "ack", commandId: ack.commandId, status: ack.status });
      } catch (cause) {
        dispatch({
          type: "error",
          message: cause instanceof ApiError ? cause.message : "Không gửi được lệnh.",
        });
      }
    },
    [],
  );

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const track = useCallback(
    (commandId: string, deviceId?: string | null) => {
      dispatch({ type: "adopt", commandId, deviceId: deviceId ?? null });
    },
    [],
  );

  const busy = useMemo(() => state.status === "sending" || state.status === "waiting", [state.status]);

  return { ...state, busy, requestRelay, track, reset };
}