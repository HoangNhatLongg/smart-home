/**
 * Mock Backend fixtures, seeded from docs/SYSTEM_SPEC.md §15 (Hardware
 * Deployment), docs/DATABASE_SPEC.md §3 and docs/API_SPEC.md §5.
 *
 * This is the only file allowed to contain demo data. Components never hardcode
 * fixtures (invariant 4).
 */

import type {
  Automation,
  Command,
  Device,
  DeviceConfiguration,
  FirmwareVersion,
  Home,
  OtaJob,
  Room,
  StateHistoryEntry,
  StateValue,
  TelemetryPoint,
} from "@/lib/api/contract";
import { registryCodeOf } from "@/lib/api/normalize";

export interface MockUser {
  id: string;
  email: string;
  password: string;
}

export const MOCK_USER_ID = "user-00000000-0000-4000-8000-000000000001";
export const MOCK_HOME_ID = "home-00000000-0000-4000-8000-000000000001";
export const MOCK_ROOM_LIVING = "room-00000000-0000-4000-8000-000000000001";
export const MOCK_ROOM_BEDROOM = "room-00000000-0000-4000-8000-000000000002";
export const MOCK_ROOM_KITCHEN = "room-00000000-0000-4000-8000-000000000003";

export const DEMO_CREDENTIALS = { email: "demo@example.com", password: "123456" } as const;

export const MOCK_USERS: MockUser[] = [
  { id: MOCK_USER_ID, email: DEMO_CREDENTIALS.email, password: DEMO_CREDENTIALS.password },
];

export const createHomes = (): Home[] => [
  { id: MOCK_HOME_ID, name: "Nhà chính", ownerId: MOCK_USER_ID, roomCount: 3, deviceCount: 5 },
];

export const createRooms = (): Room[] => [
  { id: MOCK_ROOM_LIVING, homeId: MOCK_HOME_ID, name: "Phòng khách" },
  { id: MOCK_ROOM_BEDROOM, homeId: MOCK_HOME_ID, name: "Phòng ngủ" },
  { id: MOCK_ROOM_KITCHEN, homeId: MOCK_HOME_ID, name: "Bếp" },
];

interface DeviceSeed {
  deviceId: string;
  name: string;
  roomId: string;
  roomName: string;
  status: Device["status"];
  firmwareVersion: string | null;
  lastSeenOffsetSeconds: number | null;
  instances: string[];
}

const DEVICE_SEEDS: DeviceSeed[] = [
  {
    deviceId: "esp32-c3-001",
    name: "ESP32 phòng khách",
    roomId: MOCK_ROOM_LIVING,
    roomName: "Phòng khách",
    status: "online",
    firmwareVersion: "1.0.0",
    lastSeenOffsetSeconds: 25,
    instances: ["temperature", "humidity", "relay_1"],
  },
  {
    deviceId: "esp32-c3-002",
    name: "ESP32 phòng ngủ",
    roomId: MOCK_ROOM_BEDROOM,
    roomName: "Phòng ngủ",
    status: "online",
    firmwareVersion: "1.0.0",
    lastSeenOffsetSeconds: 10,
    instances: ["temperature", "humidity", "relay_2"],
  },
  {
    deviceId: "esp32-c3-003",
    name: "ESP32 bếp",
    roomId: MOCK_ROOM_KITCHEN,
    roomName: "Bếp",
    status: "online",
    firmwareVersion: "1.0.0",
    lastSeenOffsetSeconds: 4,
    instances: ["temperature", "humidity"],
  },
  {
    deviceId: "esp32-c3-004",
    name: "ESP32 dự phòng 1",
    roomId: MOCK_ROOM_LIVING,
    roomName: "Phòng khách",
    status: "offline",
    firmwareVersion: "1.0.0",
    lastSeenOffsetSeconds: 7200,
    instances: ["temperature"],
  },
  {
    deviceId: "esp32-c3-005",
    name: "ESP32 dự phòng 2",
    roomId: MOCK_ROOM_KITCHEN,
    roomName: "Bếp",
    status: "unknown",
    firmwareVersion: null,
    lastSeenOffsetSeconds: null,
    instances: ["temperature", "humidity"],
  },
];

function instanceName(instanceCode: string): string | null {
  const names: Record<string, string> = {
    temperature: "Nhiệt độ",
    humidity: "Độ ẩm",
    relay_1: "Đèn phòng khách",
    relay_2: "Đèn phòng ngủ",
  };
  return names[instanceCode] ?? null;
}

export function createDevices(now = Date.now()): Device[] {
  return DEVICE_SEEDS.map((seed, index) => ({
    id: `device-00000000-0000-4000-8000-00000000000${index + 1}`,
    deviceId: seed.deviceId,
    name: seed.name,
    roomId: seed.roomId,
    roomName: seed.roomName,
    status: seed.status,
    firmwareVersion: seed.firmwareVersion,
    lastSeenAt:
      seed.lastSeenOffsetSeconds === null
        ? null
        : new Date(now - seed.lastSeenOffsetSeconds * 1000).toISOString(),
    capabilities: seed.instances.map((instanceCode) => {
      const code = registryCodeOf(instanceCode);
      return {
        instanceCode,
        code,
        name: instanceName(instanceCode),
        type: code === "relay" ? "actuator" : "sensor",
        dataType: code === "relay" ? "boolean" : "number",
        unit: code === "temperature" ? "°C" : code === "humidity" ? "%" : null,
      };
    }),
  }));
}

/** Deterministic sine wave so mock telemetry is stable across runs. */
function wave(index: number, amplitude: number, period: number): number {
  return Math.round(amplitude * Math.sin((index / period) * Math.PI * 2) * 100) / 100;
}

export function createTelemetry(
  now = Date.now(),
  points = 40,
  intervalSeconds = 30,
): TelemetryPoint[] {
  const result: TelemetryPoint[] = [];
  // Oldest first, so a `limit` query returns the most recent N points.
  for (let step = points - 1; step >= 0; step -= 1) {
    result.push({
      recordedAt: new Date(now - step * intervalSeconds * 1000).toISOString(),
      data: {
        temperature: 28.5 + wave(step, 1.8, points),
        humidity: 68 + wave(step, 6, points / 2),
      },
    });
  }
  return result;
}

export function createConfigurations(): Record<string, DeviceConfiguration> {
  const configurations: Record<string, DeviceConfiguration> = {};
  for (const seed of DEVICE_SEEDS) {
    const desired: Record<string, unknown> = { telemetry_interval: 30 };
    if (seed.instances.includes("relay_1")) desired.relay_1_name = "Đèn phòng khách";
    if (seed.instances.includes("relay_2")) desired.relay_2_name = "Đèn phòng ngủ";
    configurations[seed.deviceId] = {
      deviceId: seed.deviceId,
      configVersion: 1,
      desired: { ...desired },
      applied: { ...desired },
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return configurations;
}

export const createFirmwareVersions = (now = Date.now()): FirmwareVersion[] => [
  {
    id: "firmware-00000000-0000-4000-8000-000000000001",
    version: "1.0.0",
    firmwareUrl: "https://example.local/firmware/esp32-generic-node-1.0.0.bin",
    checksum: "sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
    fileSize: 812_544,
    releaseNote: "Bản phát hành nền tảng Generic Node.",
    createdAt: new Date(now - 30 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "firmware-00000000-0000-4000-8000-000000000002",
    version: "1.1.0",
    firmwareUrl: "https://example.local/firmware/esp32-generic-node-1.1.0.bin",
    checksum: "sha256:1f2e3d4c5b6a798899a6b5c4d3e2f101f2e3d4c5b6a798899a6b5c4d3e2f10",
    fileSize: 838_016,
    releaseNote: "Thêm OTA status chi tiết và telemetry interval động.",
    createdAt: new Date(now - 3 * 24 * 3600 * 1000).toISOString(),
  },
];

export const createAutomations = (): Automation[] => [
  {
    id: "automation-00000000-0000-4000-8000-000000000001",
    homeId: MOCK_HOME_ID,
    name: "Bật đèn phòng khách lúc 18:00",
    enabled: true,
    schedule: { type: "daily", time: "18:00" },
    action: {
      deviceId: "esp32-c3-001",
      capability: "relay_1",
      command: "set_relay",
      params: { state: true },
    },
  },
  {
    id: "automation-00000000-0000-4000-8000-000000000002",
    homeId: MOCK_HOME_ID,
    name: "Tắt đèn phòng ngủ lúc 22:30",
    enabled: true,
    schedule: { type: "daily", time: "22:30" },
    action: {
      deviceId: "esp32-c3-002",
      capability: "relay_2",
      command: "set_relay",
      params: { state: false },
    },
  },
];
/** commands.payload is JSONB (DATABASE_SPEC §3) and is not part of the canonical Command. */
export interface MockCommand extends Command {
  payload: Record<string, unknown>;
}

/** Mutable state of the in-memory mock Backend. */
export interface MockStore {
  sessionUserId: string | null;
  homes: Home[];
  rooms: Room[];
  devices: Device[];
  /** devices.device_states keyed by human deviceId, values keyed by instance code. */
  states: Record<string, Record<string, StateValue>>;
  stateUpdatedAt: Record<string, string>;
  stateHistory: StateHistoryEntry[];
  telemetry: Record<string, TelemetryPoint[]>;
  configurations: Record<string, DeviceConfiguration>;
  commands: MockCommand[];
  otaJobs: OtaJob[];
  automations: Automation[];
  firmware: FirmwareVersion[];
  sequences: { command: number; ota: number; automation: number; history: number };
}

export function createMockStore(now = Date.now()): MockStore {
  const devices = createDevices(now);
  const states: Record<string, Record<string, StateValue>> = {};
  const stateUpdatedAt: Record<string, string> = {};
  const telemetry: Record<string, TelemetryPoint[]> = {};
  for (const device of devices) {
    const hasRelay = device.capabilities.some((capability) => capability.code === "relay");
    states[device.deviceId] = hasRelay
      ? {
          [device.capabilities.find((capability) => capability.code === "relay")!.instanceCode]:
            device.deviceId === "esp32-c3-002",
        }
      : {};
    stateUpdatedAt[device.deviceId] = new Date(now - 30 * 1000).toISOString();
    telemetry[device.deviceId] = device.status === "online" ? createTelemetry(now) : [];
  }

  const history: StateHistoryEntry[] = [
    {
      id: "history-00000000-0000-4000-8000-000000000001",
      capability: "relay_1",
      value: false,
      commandId: "cmd-seed-0001",
      recordedAt: new Date(now - 3600 * 1000).toISOString(),
    },
    {
      id: "history-00000000-0000-4000-8000-000000000002",
      capability: "relay_2",
      value: true,
      commandId: "cmd-seed-0002",
      recordedAt: new Date(now - 1800 * 1000).toISOString(),
    },
    {
      id: "history-00000000-0000-4000-8000-000000000003",
      capability: "relay_1",
      value: true,
      commandId: null,
      recordedAt: new Date(now - 900 * 1000).toISOString(),
    },
  ];

  return {
    sessionUserId: null,
    homes: createHomes(),
    rooms: createRooms(),
    devices,
    states,
    stateUpdatedAt,
    stateHistory: history,
    telemetry,
    configurations: createConfigurations(),
    commands: [],
    otaJobs: [],
    automations: createAutomations(),
    firmware: createFirmwareVersions(now),
    sequences: { command: 0, ota: 0, automation: 0, history: history.length },
  };
}
