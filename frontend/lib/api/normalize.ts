/**
 * Tolerant normalizers for Backend responses.
 *
 * Every Backend response that API_SPEC.md does not define is accepted in the
 * shapes a reasonable Backend could pick: snake_case or camelCase keys, bare
 * values or `{data|items|...}` wrappers, rows or aggregates. All of that
 * tolerance lives here so components only ever see `lib/api/contract.ts` types.
 *
 * See the CONTRACT_GAPS block in `./contract.ts`.
 */

import type {
  Automation,
  AutomationAction,
  AutomationSchedule,
  CapabilityDataType,
  CapabilityType,
  Command,
  CommandStatus,
  Device,
  DeviceCapability,
  DeviceConfiguration,
  DeviceState,
  DeviceStatus,
  FirmwareVersion,
  Home,
  OtaJob,
  OtaStatus,
  Room,
  RoomCategory,
  StateHistoryEntry,
  StateValue,
  TelemetryPoint,
  User,
  VoiceCommandResult,
} from "./contract";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Unwraps `{key: value}` / `{data: value}` style envelopes. */
export function unwrap(input: unknown, ...keys: string[]): unknown {
  let current = input;
  for (const key of keys) {
    if (!isRecord(current)) return current;
    if (!(key in current)) return current;
    current = current[key];
  }
  return current;
}

/** Returns an array from a bare array or from any of the given wrapper keys. */
export function asArray(input: unknown, ...wrapperKeys: string[]): unknown[] {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return [];
  for (const key of [...wrapperKeys, "data", "items", "results"]) {
    const candidate = input[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function first(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  const value = first(source, keys);
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  const value = first(source, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  const value = first(source, keys);
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function pickRecord(
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  const value = first(source, keys);
  if (isRecord(value)) return value;
  return null;
}

function pickArray(source: Record<string, unknown>, keys: string[]): unknown[] {
  const value = first(source, keys);
  if (Array.isArray(value)) return value;
  return [];
}

function toRecord(source: unknown): Record<string, unknown> {
  return isRecord(source) ? source : {};
}

function toStringMap(source: unknown): Record<string, unknown> {
  return isRecord(source) ? source : {};
}

/** Accepts `{state: {...}}`, `{state: [{capability, value}]}` or a bare object. */
function readStateMap(input: unknown): Record<string, StateValue> {
  const source = toRecord(input);
  const raw = source.state !== undefined ? source.state : source.data;
  if (Array.isArray(raw)) {
    const folded: Record<string, StateValue> = {};
    for (const row of raw) {
      const record = toRecord(row);
      const key =
        pickString(record, ["instanceCode", "instance_code", "capability", "code"]) ??
        "";
      if (!key) continue;
      folded[key] = readStateValue(record, key);
    }
    return folded;
  }
  return toStringMap(raw);
}

function readStateValue(record: Record<string, unknown>, key: string): StateValue {
  if (record.value !== undefined) return record.value;
  const state = record.state ?? record.data;
  if (isRecord(state)) {
    if (key in state) return state[key];
    const entries = Object.entries(state);
    if (entries.length === 1) return entries[0][1];
    return state;
  }
  return state ?? null;
}

const DEVICE_STATUSES: DeviceStatus[] = ["online", "offline", "unknown"];

export function normalizeDeviceStatus(value: unknown): DeviceStatus {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if ((DEVICE_STATUSES as string[]).includes(lowered)) return lowered as DeviceStatus;
  }
  return "unknown";
}

const COMMAND_STATUSES: CommandStatus[] = [
  "PENDING",
  "SENT",
  "SUCCESS",
  "FAILED",
  "TIMEOUT",
];

export function normalizeCommandStatus(value: unknown): CommandStatus {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if ((COMMAND_STATUSES as string[]).includes(upper)) return upper as CommandStatus;
  }
  // Never report a terminal status for an unknown value: keep waiting.
  return "PENDING";
}

const OTA_STATUSES: OtaStatus[] = [
  "PENDING",
  "DOWNLOADING",
  "INSTALLING",
  "REBOOTING",
  "SUCCESS",
  "FAILED",
];

export function normalizeOtaStatus(value: unknown): OtaStatus {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if ((OTA_STATUSES as string[]).includes(upper)) return upper as OtaStatus;
  }
  return "PENDING";
}

function normalizeCapabilityType(value: unknown): CapabilityType | null {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "sensor" || lowered === "actuator") return lowered;
  }
  return null;
}

function normalizeCapabilityDataType(value: unknown): CapabilityDataType | null {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "number" || lowered === "boolean" || lowered === "string") {
      return lowered;
    }
  }
  return null;
}

/** `relay_1` belongs to registry capability `relay` (SYSTEM_SPEC §6). */
export function registryCodeOf(instanceCode: string): string {
  const underscore = instanceCode.indexOf("_");
  return underscore === -1 ? instanceCode : instanceCode.slice(0, underscore);
}

export function normalizeDeviceCapability(input: unknown): DeviceCapability | null {
  const record = toRecord(input);
  const instanceCode = pickString(record, [
    "instanceCode",
    "instance_code",
    "code",
    "capability",
  ]);
  if (!instanceCode) return null;
  const code =
    pickString(record, ["capabilityCode", "capability_code", "registryCode", "code"]) ??
    registryCodeOf(instanceCode);
  return {
    instanceCode,
    code,
    name: pickString(record, ["name", "displayName", "display_name", "label"]),
    config: pickRecord(record, ["config", "metadata"]),
    type: normalizeCapabilityType(first(record, ["type", "capabilityType", "capability_type"])),
    dataType: normalizeCapabilityDataType(first(record, ["dataType", "data_type"])),
    unit: pickString(record, ["unit"]),
  };
}

export function normalizeDeviceCapabilities(input: unknown): DeviceCapability[] {
  return asArray(input, "capabilities")
    .map(normalizeDeviceCapability)
    .filter((item): item is DeviceCapability => item !== null);
}

export function normalizeUser(input: unknown): User | null {
  const source = toRecord(unwrap(input, "user", "data"));
  const id = pickString(source, ["id", "userId", "user_id", "uuid"]);
  const email = pickString(source, ["email"]);
  if (!id && !email) return null;
  return { id: id ?? "", email: email ?? "" };
}

export function normalizeHome(input: unknown): Home | null {
  const source = toRecord(unwrap(input, "home", "data"));
  const id = pickString(source, ["id", "homeId", "home_id", "uuid"]);
  const name = pickString(source, ["name"]);
  if (!id && !name) return null;
  return {
    id: id ?? "",
    name: name ?? "",
    ownerId: pickString(source, ["ownerId", "owner_id"]),
    roomCount: pickNumber(source, ["roomCount", "room_count", "roomsCount"]),
    deviceCount: pickNumber(source, ["deviceCount", "device_count", "devicesCount"]),
  };
}

export function normalizeHomes(input: unknown): Home[] {
  return asArray(input, "homes")
    .map(normalizeHome)
    .filter((item): item is Home => item !== null);
}

export function normalizeRoom(input: unknown): Room | null {
  const source = toRecord(unwrap(input, "room", "data"));
  const id = pickString(source, ["id", "roomId", "room_id", "uuid", "slug"]);
  const name = pickString(source, ["name"]);
  if (!id && !name) return null;
  return {
    id: id ?? "",
    homeId: pickString(source, ["homeId", "home_id"]),
    name: name ?? "",
    category: (pickString(source, ["category"]) as RoomCategory | null) ?? "other",
    floor: pickNumber(source, ["floor"]),
  };
}

export function normalizeRooms(input: unknown): Room[] {
  return asArray(input, "rooms")
    .map(normalizeRoom)
    .filter((item): item is Room => item !== null);
}

export function normalizeDevice(input: unknown): Device | null {
  const source = toRecord(unwrap(input, "device", "data"));
  const deviceId = pickString(source, ["deviceId", "device_id", "id"]);
  if (!deviceId) return null;
  return {
    id: pickString(source, ["id", "uuid"]) ?? deviceId,
    deviceId,
    name: pickString(source, ["name", "displayName", "display_name"]) ?? deviceId,
    roomId: pickString(source, ["roomId", "room_id"]),
    roomName: pickString(source, ["roomName", "room_name", "room"]),
    status: normalizeDeviceStatus(first(source, ["status", "availability", "state"])),
    firmwareVersion: pickString(source, [
      "firmwareVersion",
      "firmware_version",
      "fwVersion",
      "fw_version",
    ]),
    lastSeenAt: pickString(source, [
      "lastSeenAt",
      "last_seen_at",
      "lastSeen",
      "last_seen",
    ]),
    capabilities: normalizeDeviceCapabilities(first(source, ["capabilities"])),
  };
}

export function normalizeDevices(input: unknown): Device[] {
  return asArray(input, "devices")
    .map(normalizeDevice)
    .filter((item): item is Device => item !== null);
}

export function normalizeDeviceState(input: unknown, deviceId: string): DeviceState {
  const source = toRecord(input);
  const nested = isRecord(source.status) ? source.status : source;
  return {
    deviceId,
    state: readStateMap(source),
    updatedAt: pickString(nested, ["updatedAt", "updated_at", "timestamp", "lastUpdated"]),
  };
}

export function normalizeStateHistory(input: unknown): StateHistoryEntry[] {
  return asArray(input, "history", "stateHistory", "state_history").map((row, index) => {
    const record = toRecord(row);
    const capability =
      pickString(record, [
        "instanceCode",
        "instance_code",
        "capability",
        "capabilityCode",
        "capability_code",
        "code",
      ]) ?? "";
    return {
      id: pickString(record, ["id", "uuid"]) ?? `history-${index}`,
      capability,
      value: readStateValue(record, capability),
      commandId: pickString(record, ["commandId", "command_id"]),
      recordedAt:
        pickString(record, [
          "recordedAt",
          "recorded_at",
          "timestamp",
          "createdAt",
          "created_at",
        ]) ?? "",
    };
  });
}

function normalizeTelemetryData(input: unknown): Record<string, number | null> {
  const source = toStringMap(input);
  const result: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) result[key] = parsed;
    } else {
      result[key] = null;
    }
  }
  return result;
}

export function normalizeTelemetry(input: unknown): TelemetryPoint[] {
  const points = asArray(input, "telemetry", "points", "series").map((row) => {
    const record = toRecord(row);
    return {
      recordedAt:
        pickString(record, [
          "recordedAt",
          "recorded_at",
          "timestamp",
          "time",
          "createdAt",
          "created_at",
        ]) ?? "",
      data: normalizeTelemetryData(first(record, ["data", "values", "payload"])),
    };
  });
  // REST returns newest first; charts and current-reading panels consume
  // chronological points and take the last point as the latest reading.
  return points.sort((a, b) => {
    const aTime = Date.parse(a.recordedAt);
    const bTime = Date.parse(b.recordedAt);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (!aValid) return bValid ? -1 : 0;
    if (!bValid) return 1;
    return aTime - bTime;
  });
}

export function normalizeCommand(input: unknown): Command | null {
  const source = toRecord(unwrap(input, "command", "data"));
  const commandId = pickString(source, ["commandId", "command_id", "id"]);
  if (!commandId) return null;
  return {
    commandId,
    deviceId: pickString(source, ["deviceId", "device_id"]),
    status: normalizeCommandStatus(first(source, ["status", "state"])),
    retryCount: pickNumber(source, ["retryCount", "retry_count", "retries"]),
    createdAt: pickString(source, ["createdAt", "created_at", "timestamp"]),
    completedAt: pickString(source, ["completedAt", "completed_at"]),
    errorMessage: pickString(source, ["errorMessage", "error_message", "error", "reason"]),
  };
}

/**
 * Reads a `{commandId, status}` acknowledgement. A POST that only returns a
 * command id is still a valid acknowledgement (API_SPEC §9).
 */
export function normalizeCommandAck(input: unknown): { commandId: string; status: CommandStatus } | null {
  const source = toRecord(unwrap(input, "command", "data"));
  const commandId = pickString(source, ["commandId", "command_id", "id", "otaJobId"]);
  if (!commandId) return null;
  return {
    commandId,
    status: normalizeCommandStatus(first(source, ["status", "state"])),
  };
}

export function normalizeFirmwareVersions(input: unknown): FirmwareVersion[] {
  return asArray(input, "firmware", "versions", "firmwareVersions").map((row) => {
    const record = toRecord(row);
    return {
      id: pickString(record, ["id", "firmwareVersionId", "firmware_version_id", "uuid"]) ?? "",
      version: pickString(record, ["version", "firmwareVersion", "firmware_version"]) ?? "",
      firmwareUrl: pickString(record, ["firmwareUrl", "firmware_url", "url"]),
      checksum: pickString(record, ["checksum", "sha256"]),
      fileSize: pickNumber(record, ["fileSize", "file_size", "size"]),
      releaseNote: pickString(record, ["releaseNote", "release_note", "notes"]),
      createdAt: pickString(record, ["createdAt", "created_at"]),
    };
  });
}

export function normalizeOtaJob(input: unknown): OtaJob | null {
  const source = toRecord(unwrap(input, "job", "otaJob", "ota_job", "data"));
  const otaJobId = pickString(source, [
    "otaJobId",
    "ota_job_id",
    "jobId",
    "job_id",
    "id",
  ]);
  if (!otaJobId) return null;
  return {
    otaJobId,
    deviceId: pickString(source, ["deviceId", "device_id"]),
    firmwareVersionId: pickString(source, [
      "firmwareVersionId",
      "firmware_version_id",
      "versionId",
      "version_id",
    ]),
    firmwareVersion: pickString(source, ["firmwareVersion", "firmware_version", "version"]),
    status: normalizeOtaStatus(first(source, ["status", "state"])),
    progress: pickNumber(source, ["progress", "percent", "percentage"]),
    errorMessage: pickString(source, ["errorMessage", "error_message", "error"]),
    createdAt: pickString(source, ["createdAt", "created_at"]),
    startedAt: pickString(source, ["startedAt", "started_at"]),
    completedAt: pickString(source, ["completedAt", "completed_at"]),
  };
}

export function normalizeOtaJobs(input: unknown): OtaJob[] {
  return asArray(input, "jobs", "otaJobs", "ota_jobs")
    .map(normalizeOtaJob)
    .filter((item): item is OtaJob => item !== null);
}

export function normalizeConfiguration(input: unknown, deviceId: string): DeviceConfiguration {
  const outer = toRecord(input);
  const nested = isRecord(outer.status) ? outer.status : outer;
  const desired =
    pickRecord(nested, ["desiredConfig", "desired_config", "desired", "config"]) ?? {};
  const applied =
    pickRecord(nested, ["appliedConfig", "applied_config", "applied"]) ?? null;
  return {
    deviceId,
    configVersion: pickNumber(nested, ["configVersion", "config_version"]),
    desired: toStringMap(desired),
    applied,
    appliedAt: pickString(nested, ["appliedAt", "applied_at"]),
    updatedAt: pickString(nested, ["updatedAt", "updated_at"]),
  };
}

function normalizeSchedule(input: unknown): AutomationSchedule {
  const source = toRecord(input);
  if (source.type === "soil_moisture_below") {
    return {
      type: "soil_moisture_below",
      sensorDeviceId: pickString(source, ["sensorDeviceId", "sensor_device_id"]) ?? "",
      capability: "soil_moisture",
      threshold: pickNumber(source, ["threshold"]) ?? 0,
      cooldownMinutes: pickNumber(source, ["cooldownMinutes", "cooldown_minutes"]) ?? 60,
    };
  }
  const time = pickString(source, ["time", "at", "hour"]) ?? "00:00";
  return { type: "daily", time };
}

function normalizeAction(input: unknown): AutomationAction {
  const source = toRecord(input);
  return {
    deviceId: pickString(source, ["deviceId", "device_id", "target"]) ?? "",
    capability: pickString(source, ["capability", "instanceCode", "instance_code"]) ?? "",
    command: pickString(source, ["command", "commandType", "command_type"]) ?? "set_relay",
    params: toStringMap(first(source, ["params", "payload"])),
    offAfterMinutes: pickNumber(source, ["offAfterMinutes", "off_after_minutes"] ) ?? undefined,
    offTime: pickString(source, ["offTime", "off_time"] ) ?? undefined,
  };
}

export function normalizeAutomation(input: unknown): Automation | null {
  const source = toRecord(unwrap(input, "automation", "data"));
  const id = pickString(source, ["id", "automationId", "automation_id", "uuid"]);
  const name = pickString(source, ["name"]);
  if (!id && !name) return null;
  return {
    id: id ?? "",
    homeId: pickString(source, ["homeId", "home_id"]),
    name: name ?? "",
    enabled: pickBoolean(source, ["enabled"]) ?? true,
    schedule: normalizeSchedule(first(source, ["schedule"])),
    action: normalizeAction(first(source, ["action"])),
  };
}

export function normalizeAutomations(input: unknown): Automation[] {
  return asArray(input, "automations", "rules", "automationRules", "automation_rules")
    .map(normalizeAutomation)
    .filter((item): item is Automation => item !== null);
}

export function normalizeVoiceResult(input: unknown): VoiceCommandResult {
  const source = toRecord(unwrap(input, "result", "data"));
  const success = pickBoolean(source, ["success", "ok"]) ?? false;
  return {
    success,
    message: pickString(source, ["message", "reply", "text", "detail"]),
    commandId: pickString(source, ["commandId", "command_id"]),
  };
}

/** Best-effort message extraction from an unknown error body (API_SPEC §14). */
export function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim() !== "") return body.trim();
  if (isRecord(body)) {
    const direct = first(body, ["message", "error_description", "detail"]);
    if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
    const error = first(body, ["error"]);
    if (typeof error === "string" && error.trim() !== "") return error.trim();
    if (isRecord(error)) {
      const nested = first(error, ["message", "detail"]);
      if (typeof nested === "string" && nested.trim() !== "") return nested.trim();
    }
    const errors = first(body, ["errors"]);
    if (Array.isArray(errors)) {
      const messages = errors
        .map((item) => (typeof item === "string" ? item : extractErrorMessage(item, "")))
        .filter((item) => item !== "");
      if (messages.length > 0) return messages.join("; ");
    }
    if (isRecord(errors)) {
      const nested = extractErrorMessage(errors, "");
      if (nested !== "") return nested;
    }
  }
  return fallback;
}

export const normalizeStringArray = (input: unknown): string[] =>
  pickArray(toRecord(input), ["values", "items"]).filter(
    (item): item is string => typeof item === "string",
  );
