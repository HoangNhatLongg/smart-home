import { describe, expect, it } from "vitest";
import {
  asArray,
  extractErrorMessage,
  normalizeAutomation,
  normalizeCommand,
  normalizeCommandAck,
  normalizeConfiguration,
  normalizeDevice,
  normalizeDeviceState,
  normalizeDevices,
  normalizeRooms,
  normalizeStateHistory,
  normalizeTelemetry,
  normalizeVoiceResult,
  registryCodeOf,
  unwrap,
} from "@/lib/api/normalize";

describe("unwrap / asArray", () => {
  it("unwraps nested envelopes", () => {
    expect(unwrap({ user: { id: "u1" } }, "user")).toEqual({ id: "u1" });
    expect(unwrap({ user: { id: "u1" } }, "device")).toEqual({ user: { id: "u1" } });
  });

  it("accepts bare arrays and common wrappers", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray({ rooms: [1] }, "rooms")).toEqual([1]);
    expect(asArray({ data: [2] }, "rooms")).toEqual([2]);
    expect(asArray({ items: [3] }, "rooms")).toEqual([3]);
    expect(asArray(null, "rooms")).toEqual([]);
  });
});

describe("normalizeDevice", () => {
  it("reads the API_SPEC camelCase shape", () => {
    const device = normalizeDevice({
      id: "uuid-1",
      deviceId: "esp32-c3-001",
      name: "ESP32 phòng khách",
      status: "online",
      firmwareVersion: "1.0.0",
      lastSeenAt: "2026-10-05T08:00:00Z",
      capabilities: [],
    });
    expect(device).toMatchObject({
      id: "uuid-1",
      deviceId: "esp32-c3-001",
      status: "online",
      firmwareVersion: "1.0.0",
      lastSeenAt: "2026-10-05T08:00:00Z",
    });
  });

  it("reads the DATABASE_SPEC snake_case shape and keeps uppercase device ids verbatim", () => {
    const device = normalizeDevice({
      device_id: "ESP32-C3-001",
      name: "ESP32 phòng khách",
      status: "ONLINE",
      firmware_version: null,
      last_seen_at: null,
      capabilities: [
        { instance_code: "relay_1" },
        { instance_code: "temperature", name: "Nhiệt độ", unit: "°C" },
      ],
    });
    expect(device?.deviceId).toBe("ESP32-C3-001");
    expect(device?.firmwareVersion).toBeNull();
    expect(device?.lastSeenAt).toBeNull();
    expect(device?.status).toBe("online");
    expect(device?.capabilities.map((item) => item.instanceCode)).toEqual([
      "relay_1",
      "temperature",
    ]);
    expect(device?.capabilities[0].code).toBe("relay");
  });

  it("never invents an offline status for unknown values", () => {
    expect(normalizeDevice({ deviceId: "d", status: "weird" })?.status).toBe("unknown");
    expect(normalizeDevice({ deviceId: "d" })?.status).toBe("unknown");
    expect(normalizeDevice({ name: "no id" })).toBeNull();
  });

  it("normalizes a wrapped device list", () => {
    expect(normalizeDevices({ devices: [{ deviceId: "a" }, { device_id: "b" }] })).toHaveLength(2);
  });
});

describe("normalizeDeviceState", () => {
  it("reads the MQTT_SPEC state object", () => {
    const state = normalizeDeviceState(
      { state: { relay_1: true }, updated_at: "2026-10-05T08:00:05Z" },
      "esp32-c3-001",
    );
    expect(state.state).toEqual({ relay_1: true });
    expect(state.updatedAt).toBe("2026-10-05T08:00:05Z");
    expect(state.deviceId).toBe("esp32-c3-001");
  });

  it("folds capability rows into a state map", () => {
    const state = normalizeDeviceState(
      { state: [{ instanceCode: "relay_1", value: true }, { capability: "relay_2", value: false }] },
      "esp32-c3-002",
    );
    expect(state.state).toEqual({ relay_1: true, relay_2: false });
  });

  it("treats a missing state as an empty map, not as offline", () => {
    expect(normalizeDeviceState({}, "d").state).toEqual({});
    expect(normalizeDeviceState(null, "d").state).toEqual({});
  });
});

describe("normalizeStateHistory", () => {
  it("reads both key styles and keeps command_id null for local changes", () => {
    const entries = normalizeStateHistory({
      history: [
        { id: "h1", instance_code: "relay_1", state: { relay_1: true }, command_id: "cmd-1", recorded_at: "2026-10-05T08:00:05Z" },
        { id: "h2", capability: "relay_2", value: false, recordedAt: "2026-10-05T08:01:05Z" },
      ],
    });
    expect(entries[0]).toMatchObject({ capability: "relay_1", value: true, commandId: "cmd-1" });
    expect(entries[1]).toMatchObject({ capability: "relay_2", value: false, commandId: null });
  });
});

describe("normalizeTelemetry", () => {
  it("puts newest REST reading last without changing values or input order", () => {
    const rows = [
      { recordedAt: "2026-10-06T13:35:26Z", data: { temperature: 34, humidity: 66 } },
      { recordedAt: "2026-10-06T13:34:24Z", data: { temperature: 28, humidity: 66.0999984741211 } },
    ];
    const points = normalizeTelemetry(rows);
    expect(points.map(point => point.data.temperature)).toEqual([28, 34]);
    expect(points[0].data.humidity).toBe(66.0999984741211);
    expect(rows[0].data.temperature).toBe(34);
    expect(normalizeTelemetry([...rows].reverse())).toEqual(points);
  });

  it("does not let a missing timestamp replace a dated latest reading", () => {
    const points = normalizeTelemetry([
      { recordedAt: "2026-10-06T13:35:26Z", data: { temperature: 34 } },
      { data: { temperature: 10 } },
    ]);
    expect(points.at(-1)?.data.temperature).toBe(34);
  });

  it("supports REST recordedAt and MQTT timestamp", () => {
    const rest = normalizeTelemetry([{ data: { temperature: 28.5 }, recordedAt: "2026-10-05T08:00:00Z" }]);
    const mqtt = normalizeTelemetry([{ timestamp: "2026-10-05T08:00:00Z", data: { temperature: 28.5 } }]);
    expect(rest[0]).toEqual(mqtt[0]);
    expect(rest[0].data.temperature).toBe(28.5);
  });

  it("keeps non numeric readings as null instead of dropping them", () => {
    const [point] = normalizeTelemetry([{ recordedAt: "x", data: { temperature: null, humidity: 72 } }]);
    expect(point.data).toEqual({ temperature: null, humidity: 72 });
  });
});

describe("normalizeCommand", () => {
  it("reads commandId and terminal statuses", () => {
    const command = normalizeCommand({
      command_id: "cmd-uuid",
      status: "success",
      retry_count: 2,
      completed_at: "2026-10-05T08:00:05Z",
    });
    expect(command).toMatchObject({ commandId: "cmd-uuid", status: "SUCCESS", retryCount: 2 });
  });

  it("never reports a terminal status for an unknown value", () => {
    expect(normalizeCommand({ commandId: "c", status: "weird" })?.status).toBe("PENDING");
  });

  it("normalizes the POST acknowledgement", () => {
    expect(normalizeCommandAck({ commandId: "cmd-1", status: "PENDING" })).toEqual({
      commandId: "cmd-1",
      status: "PENDING",
    });
    expect(normalizeCommandAck({ command_id: "cmd-2" })?.commandId).toBe("cmd-2");
    expect(normalizeCommandAck({})).toBeNull();
  });
});

describe("normalizeConfiguration", () => {
  it("reads the status endpoint with desired/applied snake_case", () => {
    const configuration = normalizeConfiguration(
      {
        config_version: 3,
        desired_config: { telemetry_interval: 30 },
        applied_config: { telemetry_interval: 60 },
        applied_at: "2026-10-05T08:00:00Z",
      },
      "esp32-c3-001",
    );
    expect(configuration).toMatchObject({
      configVersion: 3,
      desired: { telemetry_interval: 30 },
      applied: { telemetry_interval: 60 },
      appliedAt: "2026-10-05T08:00:00Z",
    });
  });

  it("accepts a nested status envelope and a missing applied config", () => {
    const configuration = normalizeConfiguration(
      { status: { desired: { telemetry_interval: 30 }, applied: null } },
      "esp32-c3-001",
    );
    expect(configuration.applied).toBeNull();
    expect(configuration.desired).toEqual({ telemetry_interval: 30 });
  });
});

describe("normalizeAutomation", () => {
  it("reads the camelCase action from API_SPEC", () => {
    const automation = normalizeAutomation({
      id: "a1",
      name: "Bật đèn phòng khách",
      enabled: false,
      schedule: { type: "daily", time: "18:00" },
      action: { deviceId: "esp32-c3-001", capability: "relay_1", command: "set_relay", params: { state: true } },
    });
    expect(automation?.action.deviceId).toBe("esp32-c3-001");
    expect(automation?.enabled).toBe(false);
  });

  it("also reads the DATABASE_SPEC snake_case action", () => {
    const automation = normalizeAutomation({
      id: "a2",
      name: "Tắt đèn",
      action: { device_id: "esp32-c3-002", capability: "relay_2", params: { state: false } },
    });
    expect(automation?.action).toMatchObject({
      deviceId: "esp32-c3-002",
      capability: "relay_2",
      command: "set_relay",
    });
  });
});

describe("normalizeVoiceResult", () => {
  it("reads success/message/commandId", () => {
    expect(
      normalizeVoiceResult({ success: true, message: "Đã bật đèn phòng khách.", commandId: "uuid" }),
    ).toEqual({ success: true, message: "Đã bật đèn phòng khách.", commandId: "uuid" });
  });

  it("reports failure without a command id", () => {
    expect(normalizeVoiceResult({ success: false })).toEqual({
      success: false,
      message: null,
      commandId: null,
    });
  });
});

describe("normalizeRooms", () => {
  it("accepts roomId, room_id and slug identifiers", () => {
    expect(normalizeRooms([{ roomId: "r1", name: "Phòng khách" }])[0].id).toBe("r1");
    expect(normalizeRooms([{ room_id: "r2", name: "Phòng ngủ" }])[0].id).toBe("r2");
    expect(normalizeRooms({ rooms: [{ slug: "bep", name: "Bếp" }] })[0].id).toBe("bep");
  });
});

describe("registryCodeOf", () => {
  it("maps instance codes to registry capability codes", () => {
    expect(registryCodeOf("relay_1")).toBe("relay");
    expect(registryCodeOf("relay_2")).toBe("relay");
    expect(registryCodeOf("temperature")).toBe("temperature");
  });
});

describe("extractErrorMessage", () => {
  it("reads every documented error body variant", () => {
    expect(extractErrorMessage({ message: "sai mật khẩu" }, "fallback")).toBe("sai mật khẩu");
    expect(extractErrorMessage({ error: "not found" }, "fallback")).toBe("not found");
    expect(extractErrorMessage({ error: { message: "nested" } }, "fallback")).toBe("nested");
    expect(extractErrorMessage({ errors: ["a", "b"] }, "fallback")).toBe("a; b");
    expect(extractErrorMessage("plain text", "fallback")).toBe("plain text");
    expect(extractErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
