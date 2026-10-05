/**
 * Mock Backend request handlers.
 *
 * The route table mirrors docs/API_SPEC.md one-to-one and simulates the parts
 * of the Backend behaviour the Frontend depends on:
 *  - Home-owner authorization (DATABASE_SPEC §4) -> 401 / 403;
 *  - the command lifecycle PENDING -> SENT -> SUCCESS | FAILED (MQTT_SPEC §13);
 *  - a device that never answers State never reports SUCCESS (SYSTEM_SPEC rule 7);
 *  - desired/applied configuration lag (SYSTEM_SPEC §7);
 *  - OTA job progression (SYSTEM_SPEC §12).
 */

import { ApiError } from "@/lib/api/client";
import type {
  Automation,
  AutomationAction,
  AutomationSchedule,
  CapabilityDataType,
  CapabilityType,
  CommandStatus,
  OtaJob,
  OtaStatus,
  StateValue,
  VoiceCommandResult,
} from "@/lib/api/contract";
import { MOCK_USER_ID, MOCK_USERS, type MockCommand, type MockStore, type MockUser } from "./fixtures";

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

type Handler = (store: MockStore, request: MockRequest, params: string[]) => MockResponse;

const SENT_AFTER_MS = 350;
const CONFIRM_AFTER_MS = 1300;
const CONFIG_APPLY_AFTER_MS = 2500;
const OTA_STEPS: { delayMs: number; status: OtaStatus; progress: number }[] = [
  { delayMs: 600, status: "DOWNLOADING", progress: 20 },
  { delayMs: 1200, status: "DOWNLOADING", progress: 55 },
  { delayMs: 1800, status: "INSTALLING", progress: 75 },
  { delayMs: 2400, status: "REBOOTING", progress: 90 },
  { delayMs: 3200, status: "SUCCESS", progress: 100 },
];

function notFound(message: string): never {
  throw new ApiError(404, message);
}

function unauthorized(): never {
  throw new ApiError(401, "Chưa đăng nhập.");
};

function requireSession(store: MockStore): MockUser {
  if (!store.sessionUserId) return unauthorized();
  const user = MOCK_USERS.find((item) => item.id === store.sessionUserId);
  if (!user) return unauthorized();
  return user;
}

function requireOwnedHome(store: MockStore, homeId: string): void {
  requireSession(store);
  const home = store.homes.find((item) => item.id === homeId);
  if (!home) notFound("Không tìm thấy Home.");
  if (home.ownerId !== store.sessionUserId) {
    throw new ApiError(403, "Bạn không có quyền truy cập Home này.");
  }
}

function findDevice(store: MockStore, deviceId: string) {
  const device =
    store.devices.find((item) => item.deviceId === deviceId) ??
    store.devices.find((item) => item.id === deviceId);
  if (!device) notFound(`Không tìm thấy thiết bị ${deviceId}.`);
  return device;
}

function requireOwnedDevice(store: MockStore, deviceId: string) {
  const device = findDevice(store, deviceId);
  const room = store.rooms.find((item) => item.id === device.roomId);
  const home = room ? store.homes.find((item) => item.id === room.homeId) : undefined;
  if (!home || home.ownerId !== store.sessionUserId) {
    throw new ApiError(403, "Bạn không có quyền truy cập thiết bị này.");
  }
  return device;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function numberFromQuery(query: URLSearchParams, key: string, fallback: number): number {
  const raw = query.get(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function devicePayload(store: MockStore, deviceId: string) {
  const device = findDevice(store, deviceId);
  const room = store.rooms.find((item) => item.id === device.roomId);
  return {
    ...device,
    roomName: device.roomName ?? room?.name ?? null,
    capabilities: device.capabilities,
  };
}

/** Applies a confirmed state change: state row + state_history row (STATE-01/02/03). */
function applyConfirmedState(
  store: MockStore,
  deviceId: string,
  instanceCode: string | null,
  value: StateValue,
  commandId: string | null,
): void {
  const now = new Date().toISOString();
  const current = store.states[deviceId] ?? {};
  if (instanceCode) current[instanceCode] = value;
  store.states[deviceId] = current;
  store.stateUpdatedAt[deviceId] = now;
  store.sequences.history += 1;
  store.stateHistory.push({
    id: `history-mock-${store.sequences.history}`,
    capability: instanceCode ?? "",
    value,
    commandId,
    recordedAt: now,
  });
}

function startCommandSimulation(store: MockStore, command: MockCommand, deviceId: string): void {
  const requestedState = resolveRequestedState(store, command);
  setTimeout(() => {
    command.status = "SENT";
    if (store.devices.find((item) => item.deviceId === deviceId)?.status !== "online") {
      // Backend checks availability before sending: no pointless retry.
      setTimeout(() => {
        command.status = "FAILED";
        command.completedAt = new Date().toISOString();
        command.errorMessage = "Thiết bị offline, command không thể gửi.";
      }, 600);
      return;
    }
    setTimeout(() => {
      // The device answers with State carrying the same command_id (MQTT_SPEC §8).
      applyConfirmedState(store, deviceId, requestedState.instanceCode, requestedState.value, command.commandId);
      command.status = "SUCCESS";
      command.completedAt = new Date().toISOString();
      const device = store.devices.find((item) => item.deviceId === deviceId);
      if (device) device.lastSeenAt = command.completedAt;
    }, CONFIRM_AFTER_MS);
  }, SENT_AFTER_MS);
}

function resolveRequestedState(
  store: MockStore,
  command: MockCommand,
): { instanceCode: string | null; value: StateValue } {
  const payload = command.payload;
  const state = payload.state ?? payload.value ?? null;
  const capability = asString(payload.capability) ?? asString(payload.instanceCode);
  if (capability) return { instanceCode: capability, value: state };
  const relayIndex = payload.relay;
  if (typeof relayIndex === "number") return { instanceCode: `relay_${relayIndex}`, value: state };
  const device = store.devices.find((item) => item.deviceId === command.deviceId);
  const relay = device?.capabilities.find((item) => item.code === "relay");
  return { instanceCode: relay?.instanceCode ?? null, value: state };
}

function createCommand(
  store: MockStore,
  deviceId: string,
  commandType: string,
  payload: Record<string, unknown>,
): MockCommand {
  requireOwnedDevice(store, deviceId);
  store.sequences.command += 1;
  const command: MockCommand = {
    commandId: `cmd-mock-${String(store.sequences.command).padStart(4, "0")}`,
    deviceId,
    status: "PENDING",
    retryCount: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    errorMessage: null,
    payload: { ...payload, commandType },
  };
  store.commands.push(command);
  startCommandSimulation(store, command, deviceId);
  return command;
}

const registryPayload: {
  code: string;
  name: string;
  type: CapabilityType;
  dataType: CapabilityDataType;
  unit: string | null;
  description: string;
}[] = [
  {
    code: "temperature",
    name: "Nhiệt độ",
    type: "sensor",
    dataType: "number",
    unit: "°C",
    description: "Nhiệt độ môi trường từ DHT11.",
  },
  {
    code: "humidity",
    name: "Độ ẩm",
    type: "sensor",
    dataType: "number",
    unit: "%",
    description: "Độ ẩm không khí từ DHT11.",
  },
  {
    code: "relay",
    name: "Relay",
    type: "actuator",
    dataType: "boolean",
    unit: null,
    description: "Rơ-le điều khiển thiết bị điện.",
  },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

export const ROUTES: { method: string; pattern: RegExp; handler: Handler; public?: boolean }[] = [
  {
    method: "POST",
    pattern: /^\/api\/auth\/login$/,
    public: true,
    handler: (store, request) => {
      const body = asRecord(request.body);
      const email = asString(body.email);
      const password = asString(body.password);
      if (!email || !password) {
        throw new ApiError(400, "Email và mật khẩu là bắt buộc.");
      }
      const user = MOCK_USERS.find(
        (item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password,
      );
      if (!user) throw new ApiError(401, "Email hoặc mật khẩu không đúng.");
      store.sessionUserId = user.id;
      return { status: 200, body: { user: { id: user.id, email: user.email } } };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/logout$/,
    public: true,
    handler: (store) => {
      store.sessionUserId = null;
      return { status: 200, body: { success: true } };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/auth\/me$/,
    public: true,
    handler: (store) => {
      if (!store.sessionUserId) return unauthorized();
      const user = MOCK_USERS.find((item) => item.id === store.sessionUserId);
      return { status: 200, body: { id: user?.id ?? "", email: user?.email ?? "" } };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/homes$/,
    handler: (store) => {
      requireSession(store);
      return { status: 200, body: store.homes };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/homes$/,
    handler: (store, request) => {
      requireSession(store);
      const name = asString(asRecord(request.body).name);
      if (!name) throw new ApiError(422, "Tên Home là bắt buộc.");
      const home = {
        id: `home-mock-${store.homes.length + 1}`,
        name,
        ownerId: store.sessionUserId ?? MOCK_USER_ID,
        roomCount: 0,
        deviceCount: 0,
      };
      store.homes.push(home);
      return { status: 201, body: home };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/homes\/([^/]+)$/,
    handler: (store, _request, params) => {
      const homeId = decodeURIComponent(params[0]);
      requireOwnedHome(store, homeId);
      const home = store.homes.find((item) => item.id === homeId)!;
      const roomIds = store.rooms.filter((room) => room.homeId === homeId).map((room) => room.id);
      return {
        status: 200,
        body: {
          ...home,
          roomCount: roomIds.length,
          deviceCount: store.devices.filter((device) => roomIds.includes(device.roomId ?? "")).length,
        },
      };
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/homes\/([^/]+)$/,
    handler: (store, request, params) => {
      const homeId = decodeURIComponent(params[0]);
      requireOwnedHome(store, homeId);
      const name = asString(asRecord(request.body).name);
      if (!name) throw new ApiError(422, "Tên Home là bắt buộc.");
      const home = store.homes.find((item) => item.id === homeId)!;
      home.name = name;
      return { status: 200, body: home };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/homes\/([^/]+)$/,
    handler: (store, _request, params) => {
      const homeId = decodeURIComponent(params[0]);
      requireOwnedHome(store, homeId);
      throw new ApiError(409, "Xóa Home chưa được hỗ trợ trong MVP.");
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/homes\/([^/]+)\/rooms$/,
    handler: (store, _request, params) => {
      requireOwnedHome(store, decodeURIComponent(params[0]));
      return { status: 200, body: store.rooms.filter((room) => room.homeId === params[0]) };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/homes\/([^/]+)\/rooms$/,
    handler: (store, request, params) => {
      requireOwnedHome(store, decodeURIComponent(params[0]));
      const name = asString(asRecord(request.body).name);
      if (!name) throw new ApiError(422, "Tên phòng là bắt buộc.");
      const room = {
        id: `room-mock-${store.rooms.length + 1}`,
        homeId: decodeURIComponent(params[0]),
        name,
      };
      store.rooms.push(room);
      return { status: 201, body: room };
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/rooms\/([^/]+)$/,
    handler: (store, request, params) => {
      const roomId = decodeURIComponent(params[0]);
      const room = store.rooms.find((item) => item.id === roomId);
      if (!room) return notFound("Không tìm thấy phòng.");
      requireOwnedHome(store, room.homeId ?? "");
      const name = asString(asRecord(request.body).name);
      if (!name) throw new ApiError(422, "Tên phòng là bắt buộc.");
      room.name = name;
      return { status: 200, body: room };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/rooms\/([^/]+)$/,
    handler: (store, _request, params) => {
      const roomId = decodeURIComponent(params[0]);
      const room = store.rooms.find((item) => item.id === roomId);
      if (!room) return notFound("Không tìm thấy phòng.");
      requireOwnedHome(store, room.homeId ?? "");
      if (store.devices.some((device) => device.roomId === roomId)) {
        throw new ApiError(409, "Phòng còn thiết bị, không thể xóa.");
      }
      store.rooms = store.rooms.filter((item) => item.id !== roomId);
      return { status: 200, body: { success: true } };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/rooms\/([^/]+)\/devices$/,
    handler: (store, _request, params) => {
      const roomId = decodeURIComponent(params[0]);
      const room = store.rooms.find((item) => item.id === roomId);
      if (!room) return notFound("Không tìm thấy phòng.");
      requireOwnedHome(store, room.homeId ?? "");
      return {
        status: 200,
        body: store.devices
          .filter((device) => device.roomId === roomId)
          .map((device) => devicePayload(store, device.deviceId)),
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/capabilities\/registry$/,
    handler: (store) => {
      requireSession(store);
      return { status: 200, body: registryPayload };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/capabilities$/,
    handler: (store, _request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      return { status: 200, body: device.capabilities };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/telemetry$/,
    handler: (store, request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const limit = numberFromQuery(request.query, "limit", 100);
      const from = request.query.get("from");
      const to = request.query.get("to");
      const fromTime = from ? Date.parse(from) : Number.NaN;
      const toTime = to ? Date.parse(to) : Number.NaN;
      const points = (store.telemetry[device.deviceId] ?? [])
        .filter((point) => {
          const time = Date.parse(point.recordedAt);
          if (Number.isFinite(fromTime) && time < fromTime) return false;
          if (Number.isFinite(toTime) && time > toTime) return false;
          return true;
        })
        .slice(-limit);
      return { status: 200, body: points };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/state-history$/,
    handler: (store, request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const limit = numberFromQuery(request.query, "limit", 100);
      const from = request.query.get("from");
      const to = request.query.get("to");
      const fromTime = from ? Date.parse(from) : Number.NaN;
      const toTime = to ? Date.parse(to) : Number.NaN;
      const rows = store.stateHistory
        .filter((entry) => entry.capability !== "")
        .filter((entry) => {
          const deviceInstance = store.devices
            .find((item) => item.deviceId === device.deviceId)
            ?.capabilities.some((capability) => capability.instanceCode === entry.capability);
          if (!deviceInstance) return false;
          const time = Date.parse(entry.recordedAt);
          if (Number.isFinite(fromTime) && time < fromTime) return false;
          if (Number.isFinite(toTime) && time > toTime) return false;
          return true;
        })
        .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))
        .slice(0, limit);
      return { status: 200, body: rows };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/state$/,
    handler: (store, _request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      return {
        status: 200,
        body: {
          deviceId: device.deviceId,
          state: store.states[device.deviceId] ?? {},
          updatedAt: store.stateUpdatedAt[device.deviceId] ?? null,
        },
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/devices\/([^/]+)\/commands$/,
    handler: (store, request, params) => {
      const deviceId = decodeURIComponent(params[0]);
      const body = asRecord(request.body);
      const commandType = asString(body.commandType) ?? asString(body.command_type) ?? "set_relay";
      const payload = asRecord(body.payload);
      const command = createCommand(store, deviceId, commandType, payload);
      return { status: 202, body: { commandId: command.commandId, status: command.status } };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/commands\/([^/]+)$/,
    handler: (store, _request, params) => {
      requireSession(store);
      const commandId = decodeURIComponent(params[0]);
      const command = store.commands.find((item) => item.commandId === commandId);
      if (!command) return notFound(`Không tìm thấy command ${commandId}.`);
      return {
        status: 200,
        body: {
          commandId: command.commandId,
          deviceId: command.deviceId,
          status: command.status,
          retryCount: command.retryCount,
          createdAt: command.createdAt,
          completedAt: command.completedAt,
          errorMessage: command.errorMessage,
        },
      };
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/devices\/([^/]+)$/,
    handler: (store, request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const name = asString(asRecord(request.body).name);
      if (!name) throw new ApiError(422, "Tên thiết bị là bắt buộc.");
      device.name = name;
      return { status: 200, body: devicePayload(store, device.deviceId) };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)$/,
    handler: (store, _request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      return { status: 200, body: devicePayload(store, device.deviceId) };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/configuration\/status$/,
    handler: (store, _request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const configuration = store.configurations[device.deviceId];
      return {
        status: 200,
        body: {
          configVersion: configuration?.configVersion ?? null,
          desiredConfig: configuration?.desired ?? {},
          appliedConfig: configuration?.applied ?? null,
          appliedAt: configuration?.appliedAt ?? null,
          updatedAt: configuration?.updatedAt ?? null,
        },
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/configuration$/,
    handler: (store, _request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const configuration = store.configurations[device.deviceId];
      return {
        status: 200,
        body: {
          configVersion: configuration?.configVersion ?? null,
          desired: configuration?.desired ?? {},
          applied: configuration?.applied ?? null,
          appliedAt: configuration?.appliedAt ?? null,
        },
      };
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/devices\/([^/]+)\/configuration$/,
    handler: (store, request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const body = asRecord(request.body);
      const configuration = store.configurations[device.deviceId] ?? {
        deviceId: device.deviceId,
        configVersion: 0,
        desired: {},
        applied: null,
        appliedAt: null,
        updatedAt: null,
      };
      store.configurations[device.deviceId] = configuration;
      configuration.configVersion = (configuration.configVersion ?? 0) + 1;
      configuration.desired = { ...body };
      configuration.updatedAt = new Date().toISOString();
      const desiredSnapshot = { ...configuration.desired };
      const version = configuration.configVersion;
      // The ESP32 answers on the config topic a moment later (MQTT_SPEC §11).
      setTimeout(() => {
        if (store.configurations[device.deviceId]?.configVersion !== version) return;
        store.configurations[device.deviceId].applied = desiredSnapshot;
        store.configurations[device.deviceId].appliedAt = new Date().toISOString();
      }, CONFIG_APPLY_AFTER_MS);
      return {
        status: 200,
        body: {
          configVersion: configuration.configVersion,
          desired: configuration.desired,
          applied: configuration.applied,
        },
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/homes\/([^/]+)\/automations$/,
    handler: (store, _request, params) => {
      requireOwnedHome(store, decodeURIComponent(params[0]));
      return {
        status: 200,
        body: store.automations.filter((automation) => automation.homeId === params[0]),
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/homes\/([^/]+)\/automations$/,
    handler: (store, request, params) => {
      const homeId = decodeURIComponent(params[0]);
      requireOwnedHome(store, homeId);
      const body = asRecord(request.body);
      const name = asString(body.name);
      const schedule = asRecord(body.schedule);
      const action = asRecord(body.action);
      const time = asString(schedule.time);
      const deviceId = asString(action.deviceId) ?? asString(action.device_id);
      const capability = asString(action.capability);
      if (!name) throw new ApiError(422, "Tên automation là bắt buộc.");
      if (asString(schedule.type) !== "daily" || !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        throw new ApiError(422, "MVP chỉ hỗ trợ lịch daily với định dạng HH:MM.");
      }
      if (!deviceId || !capability) {
        throw new ApiError(422, "Automation cần deviceId và capability.");
      }
      requireOwnedDevice(store, deviceId);
      store.sequences.automation += 1;
      const automation: Automation = {
        id: `automation-mock-${store.sequences.automation}`,
        homeId,
        name,
        enabled: typeof body.enabled === "boolean" ? body.enabled : true,
        schedule: { type: "daily", time } as AutomationSchedule,
        action: {
          deviceId,
          capability,
          command: asString(action.command) ?? "set_relay",
          params: asRecord(action.params),
        } as AutomationAction,
      };
      store.automations.push(automation);
      return { status: 201, body: automation };
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/automations\/([^/]+)$/,
    handler: (store, request, params) => {
      const id = decodeURIComponent(params[0]);
      const automation = store.automations.find((item) => item.id === id);
      if (!automation) return notFound("Không tìm thấy automation.");
      requireOwnedHome(store, automation.homeId ?? "");
      const body = asRecord(request.body);
      const name = asString(body.name);
      if (name) automation.name = name;
      if (typeof body.enabled === "boolean") automation.enabled = body.enabled;
      if (body.schedule) {
        const schedule = asRecord(body.schedule);
        const time = asString(schedule.time);
        if (time) automation.schedule = { type: "daily", time };
      }
      if (body.action) {
        const action = asRecord(body.action);
        const deviceId = asString(action.deviceId) ?? asString(action.device_id);
        const capability = asString(action.capability);
        automation.action = {
          deviceId: deviceId ?? automation.action.deviceId,
          capability: capability ?? automation.action.capability,
          command: asString(action.command) ?? automation.action.command,
          params: asRecord(action.params) ?? automation.action.params,
        };
      }
      return { status: 200, body: automation };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/automations\/([^/]+)$/,
    handler: (store, _request, params) => {
      const id = decodeURIComponent(params[0]);
      const automation = store.automations.find((item) => item.id === id);
      if (!automation) return notFound("Không tìm thấy automation.");
      requireOwnedHome(store, automation.homeId ?? "");
      store.automations = store.automations.filter((item) => item.id !== id);
      return { status: 200, body: { success: true } };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/automations\/([^/]+)\/logs$/,
    handler: (store, _request, params) => {
      requireSession(store);
      const id = decodeURIComponent(params[0]);
      const automation = store.automations.find((item) => item.id === id);
      if (!automation) return notFound("Không tìm thấy automation.");
      return { status: 200, body: [] };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/firmware$/,
    handler: (store) => {
      requireSession(store);
      return { status: 200, body: store.firmware };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/devices\/([^/]+)\/ota$/,
    handler: (store, _request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      return {
        status: 200,
        body: store.otaJobs.filter((job) => job.deviceId === device.deviceId),
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/devices\/([^/]+)\/ota$/,
    handler: (store, request, params) => {
      const device = requireOwnedDevice(store, decodeURIComponent(params[0]));
      const firmwareVersionId = asString(asRecord(request.body).firmwareVersionId);
      const firmware = store.firmware.find((item) => item.id === firmwareVersionId);
      if (!firmware) throw new ApiError(422, "firmwareVersionId không hợp lệ.");
      const active = store.otaJobs.find(
        (job) => job.deviceId === device.deviceId && job.status !== "SUCCESS" && job.status !== "FAILED",
      );
      if (active) throw new ApiError(409, "Thiết bị đang có OTA job chưa hoàn tất.");
      store.sequences.ota += 1;
      const job: OtaJob = {
        otaJobId: `ota-mock-${store.sequences.ota}`,
        deviceId: device.deviceId,
        firmwareVersionId: firmware.id,
        firmwareVersion: firmware.version,
        status: "PENDING",
        progress: 0,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };
      store.otaJobs.push(job);
      job.startedAt = job.createdAt;
      const steps = device.status === "online" ? OTA_STEPS : [OTA_STEPS[0]];
      for (const step of steps) {
        setTimeout(() => {
          if (device.status !== "online") {
            job.status = "FAILED";
            job.errorMessage = "Thiết bị offline, OTA không thể bắt đầu.";
            job.completedAt = new Date().toISOString();
            return;
          }
          job.status = step.status;
          job.progress = step.progress;
          if (step.status === "SUCCESS") {
            device.firmwareVersion = firmware.version;
            device.lastSeenAt = job.completedAt ?? new Date().toISOString();
            job.completedAt = new Date().toISOString();
          }
        }, step.delayMs);
      }
      return { status: 202, body: { otaJobId: job.otaJobId, status: job.status } };
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/ota\/([^/]+)$/,
    handler: (store, _request, params) => {
      requireSession(store);
      const jobId = decodeURIComponent(params[0]);
      const job = store.otaJobs.find((item) => item.otaJobId === jobId);
      if (!job) return notFound(`Không tìm thấy OTA job ${jobId}.`);
      return { status: 200, body: job };
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/voice\/command$/,
    handler: (store, request) => {
      requireSession(store);
      const text = asString(asRecord(request.body).text);
      if (!text) throw new ApiError(400, "Nội dung giọng nói trống.");
      const normalized = normalizeText(text);
      const wantsOn = /\bbat\b|\bon\b/.test(normalized);
      const wantsOff = /\btat\b|\boff\b/.test(normalized);
      if (!wantsOn && !wantsOff) {
        const result: VoiceCommandResult = {
          success: false,
          message: "Chỉ hỗ trợ điều khiển thiết bị (bật/tắt).",
          commandId: null,
        };
        return { status: 200, body: result };
      }
      const device = store.devices.find((item) =>
        item.capabilities.some((capability) => {
          if (capability.code !== "relay") return false;
          const label = normalizeText(
            `${capability.name ?? ""} ${capability.instanceCode}`,
          );
          const tokens = label.split(/\s+/).filter(Boolean);
          // The phrase matches outright; otherwise a distinctive (>= 4 chars)
          // token from the relay name has to appear in the spoken text.
          if (normalized.includes(label)) return true;
          return tokens.some((token) => token.length >= 4 && normalized.includes(token));
        }),
      );
      if (!device) {
        const result: VoiceCommandResult = {
          success: false,
          message: "Không tìm thấy thiết bị phù hợp với yêu cầu.",
          commandId: null,
        };
        return { status: 200, body: result };
      }
      const relay = device.capabilities.find((capability) => capability.code === "relay")!;
      const command = createCommand(store, device.deviceId, "set_relay", {
        capability: relay.instanceCode,
        state: wantsOn,
      });
      // AI must never publish MQTT; the Backend runs the normal command flow.
      const result: VoiceCommandResult = {
        success: true,
        message: `${wantsOn ? "Đã bật" : "Đã tắt"} ${relay.name ?? device.name}.`,
        commandId: command.commandId,
      };
      return { status: 200, body: result };
    },
  },
];

export function findRoute(method: string, path: string) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(path);
    if (match) return { route, params: match.slice(1) };
  }
  return null;
}

export const isTerminalStatus = (status: CommandStatus): boolean =>
  status === "SUCCESS" || status === "FAILED" || status === "TIMEOUT";