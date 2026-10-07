/**
 * Canonical Frontend view of the Backend contract.
 *
 * Sources of truth (read-only for this agent):
 *   docs/API_SPEC.md, docs/DATABASE_SPEC.md, docs/MQTT_SPEC.md, docs/SYSTEM_SPEC.md
 *
 * Every shape here mirrors either an explicit API_SPEC example or a
 * DATABASE_SPEC column. Nothing else is invented: when a response body is not
 * specified by the contract, the fields are optional/nullable and the matching
 * entry in `lib/api/normalize.ts` is tolerant.
 *
 * ---------------------------------------------------------------------------
 * CONTRACT_GAPS — response shapes that API_SPEC.md leaves undefined.
 * For the Backend Agent. The Frontend already normalizes all of these; fixing
 * any one of them only requires touching `lib/api/normalize.ts`.
 *
 * G1. GET /api/homes/:homeId/rooms — is the body a bare array of rooms, or a
 *     wrapper (`{rooms: []}` / `{data: []}`)? Are `home_id` and device counts
 *     included? Is `:roomId` a UUID or a slug?
 * G2. GET /api/rooms/:roomId/devices — the array shape is documented, but the
 *     element of `capabilities` is not: is it `{instanceCode, capabilityCode,
 *     name}`? Is the room name embedded in the device? Does `id` exist at all?
 * G3. GET /api/devices/:deviceId — "complete device detail" is undefined.
 * G4. GET /api/devices/:deviceId/state — undefined. One JSONB blob per device
 *     (`{relay_1: true}`) as in MQTT_SPEC §7, or one row per capability?
 *     Is `updated_at` exposed?
 * G5. GET /api/devices/:deviceId/state-history — undefined. Only
 *     state_history columns (device_id, capability_id, command_id, state,
 *     recorded_at) are known; how is `capability_id` rendered (code, instance
 *     code, or UUID)? Is `state` the value itself or `{value: ...}`?
 * G6. GET /api/devices/:deviceId/configuration and
 *     .../configuration/status — undefined. Naming of desired/applied
 *     (`desired_config` vs `desired`), and whether `config_version` and
 *     `applied_at` are present, is unknown.
 * G7. GET /api/devices/:deviceId/ota and GET /api/ota/:jobId — undefined.
 *     Is `progress` a percentage? Is the target version a `firmware_version_id`
 *     only, or is the version string also returned?
 * G8. GET /api/firmware — undefined element shape for firmware_versions.
 * G9. GET /api/automations/:id/logs — undefined body. Also API_SPEC uses
 *     camelCase `action.deviceId` while DATABASE_SPEC stores `device_id`; the
 *     Frontend sends camelCase and reads both.
 * G10. §14 defines status codes only — the error body shape is unknown. The
 *      Frontend reads `error | message | errors | detail | error.message`.
 * G11. Auth transport is undefined: the session cookie name, or whether login
 *      returns a bearer token. The Frontend sends cookies first, then a bearer
 *      token if one was ever handed out.
 * G12. Does GET/PUT /api/devices/:deviceId accept the human `deviceId`
 *      (`esp32-c3-001`) or the device UUID? The Frontend uses the human
 *      `deviceId` (also the MQTT identifier).
 * G13. Pagination: only `limit` plus optional `from`/`to` are documented. There
 *      is no cursor, page or total. The Frontend does not display or send any
 *      pagination field that is not in the spec.
 * ---------------------------------------------------------------------------
 */

export type DeviceStatus = "online" | "offline" | "unknown";

/** DATABASE_SPEC commands.status */
export type CommandStatus =
  | "PENDING"
  | "SENT"
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT";

/** DATABASE_SPEC ota_jobs.status */
export type OtaStatus =
  | "PENDING"
  | "DOWNLOADING"
  | "INSTALLING"
  | "REBOOTING"
  | "SUCCESS"
  | "FAILED";

/** DATABASE_SPEC capability_registry.type */
export type CapabilityType = "sensor" | "actuator";

/** DATABASE_SPEC capability_registry.data_type */
export type CapabilityDataType = "number" | "boolean" | "string";

export type StateValue = unknown;

export interface User {
  id: string;
  email: string;
}

export interface Home {
  id: string;
  name: string;
  ownerId: string | null;
  roomCount: number | null;
  deviceCount: number | null;
}

export interface Room {
  id: string;
  homeId: string | null;
  name: string;
  category: RoomCategory;
  floor: number | null;
}

export const ROOM_CATEGORIES = ["living_room", "bedroom", "kitchen", "bathroom", "office", "dining_room", "garage", "outdoor", "other"] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export interface DeviceCapability {
  /** device_capabilities.instance_code, e.g. `relay_1`, `temperature`. */
  instanceCode: string;
  /** capability_registry.code, e.g. `relay`, `temperature`. */
  code: string;
  /** device_capabilities.name, nullable. */
  name: string | null;
    /** User-facing metadata for a logical peripheral, such as relay kind and note. */
    config?: Record<string, unknown> | null;
  type: CapabilityType | null;
  dataType: CapabilityDataType | null;
  unit: string | null;
}

export interface Device {
  /** devices.id */
  id: string;
  /** devices.device_id — the human identifier used in every URL and MQTT topic. */
  deviceId: string;
  name: string;
  roomId: string | null;
  roomName: string | null;
  status: DeviceStatus;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  capabilities: DeviceCapability[];
}

export interface DeviceState {
  deviceId: string;
  /** Raw MQTT_SPEC §7 `state` object, keyed by instance code. */
  state: Record<string, StateValue>;
  updatedAt: string | null;
}

export interface StateHistoryEntry {
  id: string;
  /** instance code when the Backend exposes one, else the registry code. */
  capability: string;
  value: StateValue;
  /** state_history.command_id — null for local changes (MQTT_SPEC §7). */
  commandId: string | null;
  recordedAt: string;
}

export interface TelemetryPoint {
  recordedAt: string;
  data: Record<string, number | null>;
}

export interface Command {
  commandId: string;
  deviceId: string | null;
  status: CommandStatus;
  retryCount: number | null;
  createdAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface FirmwareVersion {
  id: string;
  version: string;
  firmwareUrl: string | null;
  checksum: string | null;
  fileSize: number | null;
  releaseNote: string | null;
  createdAt: string | null;
}

export interface OtaJob {
  otaJobId: string;
  deviceId: string | null;
  firmwareVersionId: string | null;
  firmwareVersion: string | null;
  status: OtaStatus;
  /** 0-100 when the Backend reports a percentage, otherwise null. */
  progress: number | null;
  errorMessage: string | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DeviceConfiguration {
  deviceId: string;
  configVersion: number | null;
  desired: Record<string, unknown>;
  applied: Record<string, unknown> | null;
  appliedAt: string | null;
  updatedAt: string | null;
}

export interface AutomationSchedule {
  type: "daily" | "soil_moisture_below";
  time?: string;
  sensorDeviceId?: string;
  capability?: "soil_moisture";
  threshold?: number;
  cooldownMinutes?: number;
}

export interface AutomationAction {
  deviceId: string;
  capability: string;
  command: string;
  params: Record<string, unknown>;
  /** Optional delayed automatic shutdown after a successful ON command. */
  offAfterMinutes?: number;
  /** Optional daily shutdown time; valid for daily rules only. */
  offTime?: string;
}

export interface Automation {
  id: string;
  homeId: string | null;
  name: string;
  enabled: boolean;
  schedule: AutomationSchedule;
  action: AutomationAction;
}

export interface VoiceCommandResult {
  success: boolean;
  message: string | null;
  /** Must be polled before any "device confirmed" claim (SYSTEM_SPEC rule 8). */
  commandId: string | null;
}

export interface TimeRange {
  from?: string;
  to?: string;
}

/** Normalized error surface used by every component. */
export interface ApiErrorShape {
  status: number;
  message: string;
}

export const isTerminalCommandStatus = (status: CommandStatus): boolean =>
  status === "SUCCESS" || status === "FAILED" || status === "TIMEOUT";

export const isTerminalOtaStatus = (status: OtaStatus): boolean =>
  status === "SUCCESS" || status === "FAILED";
