"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import { getDeviceState, getTelemetry, listHomes, listRoomDevices, listRooms } from "@/lib/api";
import type { Device, DeviceState, Home, Room, TelemetryPoint } from "@/lib/api/contract";

export interface DeviceTreeSnapshot {
  homes: Home[];
  home: Home | null;
  rooms: Room[];
  devices: Device[];
  /** Keyed by human deviceId. `null` means the Backend returned no state. */
  states: Record<string, DeviceState | null>;
  /** Keyed by human deviceId; the single most recent telemetry point. */
  telemetry: Record<string, TelemetryPoint | null>;
}

export type DeviceTreeStatus = "idle" | "loading" | "ready" | "error";

export interface DeviceTreeState {
  status: DeviceTreeStatus;
  snapshot: DeviceTreeSnapshot | null;
  error: string | null;
  updatedAt: number | null;
}

export interface DeviceTreeController extends DeviceTreeState {
  refresh: () => void;
}

const EMPTY_SNAPSHOT: DeviceTreeSnapshot = {
  homes: [],
  home: null,
  rooms: [],
  devices: [],
  states: {},
  telemetry: {},
};

/** Refresh the latest reading along with device state on each polling cycle. */
const TREE_POLL_MS = 10_000;
const HOME_POLL_MS = 5 * 60_000;

let state: DeviceTreeState = { status: "idle", snapshot: null, error: null, updatedAt: null };
let lastHomesAt = 0;
let inFlight: Promise<void> | null = null;
let subscribers = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): DeviceTreeState => state;

function commit(next: DeviceTreeState): void {
  state = next;
  for (const listener of listeners) listener();
}

async function loadRoomsAndDevices(homeIds: string[], previous: DeviceTreeSnapshot | null) {
  const rooms = (await Promise.all(homeIds.map((homeId) => listRooms(homeId)))).flat();
  const perRoom = await Promise.all(
    rooms.map(async (room) => {
      try {
        return await listRoomDevices(room.id);
      } catch {
        return [] as Device[];
      }
    }),
  );
  const devices = perRoom.flat().map((device) => ({
    ...device,
    roomName: device.roomName ?? rooms.find((room) => room.id === device.roomId)?.name ?? null,
  }));
  return { rooms, devices, previous };
}

async function loadDeviceStates(devices: Device[]): Promise<Record<string, DeviceState | null>> {
  const entries = await Promise.all(
    devices.map(async (device): Promise<[string, DeviceState | null]> => {
      try {
        return [device.deviceId, await getDeviceState(device.deviceId)];
      } catch {
        // A missing or unreachable state row is a valid state, not an error.
        return [device.deviceId, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function loadLatestTelemetry(
  devices: Device[],
  previous: DeviceTreeSnapshot | null,
): Promise<Record<string, TelemetryPoint | null>> {
  const entries = await Promise.all(
    devices.map(async (device): Promise<[string, TelemetryPoint | null]> => {
      const cached = previous?.telemetry[device.deviceId] ?? null;
      try {
        const points = await getTelemetry(device.deviceId, { limit: 1 });
        return [device.deviceId, points[points.length - 1] ?? null];
      } catch {
        return [device.deviceId, cached];
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function loadSnapshot(forceHomes = false): Promise<void> {
  const previous = state.snapshot ?? EMPTY_SNAPSHOT;
  try {
    let homes = previous.homes;
    if (forceHomes || homes.length === 0 || Date.now() - lastHomesAt > HOME_POLL_MS) {
      homes = await listHomes();
      lastHomesAt = Date.now();
    }
    const home = homes[0] ?? null;
    if (!home) {
      commit({ status: "ready", snapshot: EMPTY_SNAPSHOT, error: null, updatedAt: Date.now() });
      return;
    }

    const { rooms, devices } = await loadRoomsAndDevices(homes.map((item) => item.id), previous);
    const [states, telemetry] = await Promise.all([
      loadDeviceStates(devices),
      loadLatestTelemetry(devices, previous),
    ]);
    commit({ status: "ready", snapshot: { homes, home, rooms, devices, states, telemetry }, error: null, updatedAt: Date.now() });
  } catch (cause) {
    const message =
      cause instanceof ApiError ? cause.message : "Không tải được danh sách thiết bị.";
    commit({
      status: previous.devices.length > 0 ? "ready" : "error",
      snapshot: previous,
      error: message,
      updatedAt: Date.now(),
    });
  }
}

function load(forceHomes = false): Promise<void> {
  if (inFlight) return inFlight;
  if (state.snapshot === null) {
    commit({ ...state, status: "loading", error: null });
  }
  inFlight = loadSnapshot(forceHomes).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function acquire(): void {
  subscribers += 1;
  if (subscribers > 1) return;
  void load();
  pollTimer = setInterval(() => {
    void load();
  }, TREE_POLL_MS);
}

function release(): void {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0 || !pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = undefined;
}

/** Test seam. */
export function resetDeviceTree(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  subscribers = 0;
  inFlight = null;
  lastHomesAt = 0;
  commit({ status: "idle", snapshot: null, error: null, updatedAt: null });
}

/** Refresh shared data after a mutation performed outside a device-tree page. */
export function refreshDeviceTree(): void {
  void load(true);
}

/** Shared Home → Room → Device tree, fanned out and cached across pages. */
export function useDeviceTree(): DeviceTreeController {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    acquire();
    return release;
  }, []);

  const refresh = useCallback(() => {
    refreshDeviceTree();
  }, []);

  return { ...current, refresh };
}

export function relayInstanceOf(device: Device | undefined): Device["capabilities"][number] | null {
  if (!device) return null;
  return device.capabilities.find((capability) => capability.code === "relay") ?? null;
}

export function telemetryValueOf(
  telemetry: TelemetryPoint | null | undefined,
  key: string,
): number | null {
  const value = telemetry?.data?.[key];
  return typeof value === "number" ? value : null;
}
