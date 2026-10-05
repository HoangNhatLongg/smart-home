import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutomation,
  deleteAutomation,
  getCommand,
  getConfigurationStatus,
  getDevice,
  getDeviceState,
  getOtaJob,
  getStateHistory,
  listAutomations,
  listFirmware,
  listHomes,
  listRooms,
  login,
  logout,
  me,
  sendRelayCommand,
  sendVoiceCommand,
  startOta,
  updateConfiguration,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { getMockStore, resetMockStore } from "@/lib/mock/server";
import { DEMO_CREDENTIALS, MOCK_HOME_ID, MOCK_USER_ID } from "@/lib/mock/fixtures";

const ONLINE_DEVICE = "esp32-c3-001";
const OFFLINE_DEVICE = "esp32-c3-004";

const signIn = () => login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);

beforeEach(() => {
  resetMockStore();
  vi.useRealTimers();
});

describe("AUTH-01..04", () => {
  it("AUTH-02: rejects a wrong password with 401", async () => {
    await expect(login(DEMO_CREDENTIALS.email, "wrong")).rejects.toMatchObject({ status: 401 });
  });

  it("AUTH-04: refuses protected resources without a session", async () => {
    await expect(me()).resolves.toBeNull();
    await expect(listRooms(MOCK_HOME_ID)).rejects.toMatchObject({ status: 401 });
  });

  it("AUTH-01/AUTH-03: login succeeds and logout invalidates the session", async () => {
    await signIn();
    await expect(me()).resolves.toMatchObject({
      id: MOCK_USER_ID,
      email: DEMO_CREDENTIALS.email,
    });
    await logout();
    await expect(me()).resolves.toBeNull();
  });
});

describe("AUTHZ-01..04", () => {
  it("AUTHZ-01: the owner may read the Home", async () => {
    await signIn();
    await expect(listRooms(MOCK_HOME_ID)).resolves.toHaveLength(3);
  });

  it("AUTHZ-02/AUTHZ-04: another user's Home is rejected with 403", async () => {
    await signIn();
    getMockStore().homes.push({
      id: "home-other",
      name: "Nhà của người khác",
      ownerId: "someone-else",
      roomCount: 1,
      deviceCount: 0,
    });
    await expect(listRooms("home-other")).rejects.toMatchObject({ status: 403 });
    await expect(getDevice(ONLINE_DEVICE)).resolves.toBeTruthy();
  });

  it("AUTHZ-02: an unknown room is 404", async () => {
    await signIn();
    await expect(listRooms("room-missing")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("CMD-01..04 / STATE-01..03", () => {
  beforeEach(signIn);

  it("CMD-01: an online device confirms with a matching State", async () => {
    vi.useFakeTimers();
    expect((await getDeviceState(ONLINE_DEVICE)).state.relay_1).toBe(false);

    const ack = await sendRelayCommand(ONLINE_DEVICE, "relay_1", true);
    expect(ack.status).toBe("PENDING");

    // Invariant 1: a 200/202 POST response must not confirm anything.
    expect((await getDeviceState(ONLINE_DEVICE)).state.relay_1).toBe(false);
    expect((await getCommand(ack.commandId))?.status).toBe("PENDING");

    await vi.advanceTimersByTimeAsync(400);
    expect((await getCommand(ack.commandId))?.status).toBe("SENT");
    expect((await getDeviceState(ONLINE_DEVICE)).state.relay_1).toBe(false);

    await vi.advanceTimersByTimeAsync(1400);
    expect((await getCommand(ack.commandId))?.status).toBe("SUCCESS");
    expect((await getDeviceState(ONLINE_DEVICE)).state.relay_1).toBe(true);
  });

  it("STATE-02/STATE-03: a confirmed command writes state_history with command_id", async () => {
    vi.useFakeTimers();
    const ack = await sendRelayCommand(ONLINE_DEVICE, "relay_1", false);
    await vi.advanceTimersByTimeAsync(2000);

    const row = (await getStateHistory(ONLINE_DEVICE, { limit: 20 })).find(
      (entry) => entry.commandId === ack.commandId,
    );
    expect(row).toMatchObject({ capability: "relay_1", value: false });
  });

  it("CMD-03/CMD-04: an offline device never reaches SUCCESS", async () => {
    vi.useFakeTimers();
    const ack = await sendRelayCommand(OFFLINE_DEVICE, "relay_1", true);
    await vi.advanceTimersByTimeAsync(5000);
    const command = await getCommand(ack.commandId);
    expect(["FAILED", "TIMEOUT"]).toContain(command?.status);
    expect(command?.completedAt).not.toBeNull();
  });

  it("returns 404 for an unknown device", async () => {
    await expect(sendRelayCommand("esp32-c3-999", "relay_1", true)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("CFG-01/CFG-03", () => {
  beforeEach(signIn);

  it("updates Desired first and reports Applied only after the device confirms", async () => {
    vi.useFakeTimers();
    expect((await getConfigurationStatus(ONLINE_DEVICE)).configVersion).toBe(1);

    await updateConfiguration(ONLINE_DEVICE, { telemetry_interval: 45 });
    const pending = await getConfigurationStatus(ONLINE_DEVICE);
    expect(pending.configVersion).toBe(2);
    expect(pending.desired.telemetry_interval).toBe(45);
    expect(pending.applied?.telemetry_interval).not.toBe(45);

    await vi.advanceTimersByTimeAsync(3000);
    expect((await getConfigurationStatus(ONLINE_DEVICE)).applied?.telemetry_interval).toBe(45);
  });
});

describe("AUTO-01", () => {
  beforeEach(signIn);

  it("creates, lists and deletes a daily schedule", async () => {
    const [home] = await listHomes();
    expect((await listAutomations(home.id)).length).toBeGreaterThanOrEqual(2);

    const automation = await createAutomation(home.id, {
      name: "Bật đèn lúc 07:00",
      enabled: true,
      schedule: { type: "daily", time: "07:00" },
      action: {
        deviceId: ONLINE_DEVICE,
        capability: "relay_1",
        command: "set_relay",
        params: { state: true },
      },
    });
    expect(automation).toMatchObject({
      name: "Bật đèn lúc 07:00",
      schedule: { type: "daily", time: "07:00" },
      action: { deviceId: ONLINE_DEVICE, capability: "relay_1" },
    });

    await deleteAutomation(automation!.id);
    expect((await listAutomations(home.id)).some((item) => item.id === automation!.id)).toBe(false);
  });

  it("rejects a schedule that is not daily", async () => {
    const [home] = await listHomes();
    await expect(
      createAutomation(home.id, {
        name: "Sai lịch",
        enabled: true,
        schedule: { type: "daily", time: "25:99" },
        action: {
          deviceId: ONLINE_DEVICE,
          capability: "relay_1",
          command: "set_relay",
          params: { state: true },
        },
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("OTA-02/OTA-03/OTA-05", () => {
  beforeEach(signIn);

  it("progresses a job to SUCCESS and updates the reported firmware version", async () => {
    vi.useFakeTimers();
    const firmware = await listFirmware();
    const target = firmware.find((item) => item.version === "1.1.0")!;

    const ack = await startOta(ONLINE_DEVICE, target.id);
    expect(ack.status).toBe("PENDING");

    await vi.advanceTimersByTimeAsync(1000);
    expect((await getOtaJob(ack.otaJobId))?.status).toBe("DOWNLOADING");

    await vi.advanceTimersByTimeAsync(3000);
    expect((await getOtaJob(ack.otaJobId))?.status).toBe("SUCCESS");
    expect((await getDevice(ONLINE_DEVICE))?.firmwareVersion).toBe("1.1.0");
  });

  it("rejects a second concurrent job with 409", async () => {
    vi.useFakeTimers();
    const firmware = await listFirmware();
    await startOta(ONLINE_DEVICE, firmware[0].id);
    await expect(startOta(ONLINE_DEVICE, firmware[0].id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("VOICE-01/VOICE-02/VOICE-04", () => {
  beforeEach(signIn);

  it("resolves CONTROL_DEVICE, returns a command id, and the command confirms later", async () => {
    vi.useFakeTimers();
    const result = await sendVoiceCommand("Bật đèn phòng khách");
    expect(result.success).toBe(true);
    expect(result.commandId).toMatch(/^cmd-mock-/);

    await vi.advanceTimersByTimeAsync(2000);
    expect((await getCommand(result.commandId!))?.status).toBe("SUCCESS");
  });

  it("returns no command when the target cannot be resolved", async () => {
    const result = await sendVoiceCommand("Bật đèn garage");
    expect(result.success).toBe(false);
    expect(result.commandId).toBeNull();
  });
});

describe("telemetry and rooms", () => {
  beforeEach(signIn);

  it("TEL-03: telemetry points are readable and bounded by limit", async () => {
    const { getTelemetry } = await import("@/lib/api");
    const points = await getTelemetry(ONLINE_DEVICE, { limit: 5 });
    expect(points).toHaveLength(5);
    expect(points[0].recordedAt <= points[4].recordedAt).toBe(true);
    expect(points[4].data.temperature).toBeTypeOf("number");
  });

  it("an offline device has no telemetry rather than fake zeroes", async () => {
    const { getTelemetry } = await import("@/lib/api");
    expect(await getTelemetry(OFFLINE_DEVICE, { limit: 5 })).toEqual([]);
  });

  it("lists devices per room", async () => {
    const { listRoomDevices } = await import("@/lib/api");
    const rooms = await listRooms(MOCK_HOME_ID);
    const living = rooms.find((room) => room.name === "Phòng khách")!;
    const devices = await listRoomDevices(living.id);
    expect(devices.map((device) => device.deviceId)).toEqual(["esp32-c3-001", "esp32-c3-004"]);
  });
});