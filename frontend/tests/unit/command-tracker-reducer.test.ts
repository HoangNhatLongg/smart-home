import { describe, expect, it } from "vitest";
import {
  commandTrackerReducer,
  initialCommandTrackerState,
  NO_DEVICE_RESPONSE,
  type CommandTrackerState,
} from "@/lib/hooks/useCommandTracker";

const sending = (): CommandTrackerState =>
  commandTrackerReducer(initialCommandTrackerState, {
    type: "send",
    deviceId: "esp32-c3-001",
    instanceCode: "relay_1",
  });

const waiting = (): CommandTrackerState =>
  commandTrackerReducer(sending(), { type: "ack", commandId: "cmd-1", status: "PENDING" });

describe("commandTrackerReducer", () => {
  it("idle -> sending keeps the command id unknown", () => {
    const state = sending();
    expect(state.status).toBe("sending");
    expect(state.commandId).toBeNull();
    expect(state.deviceId).toBe("esp32-c3-001");
  });

  it("sending -> waiting on the POST acknowledgement", () => {
    const state = waiting();
    expect(state.status).toBe("waiting");
    expect(state.commandId).toBe("cmd-1");
  });

  it("never reaches success from a successful POST response", () => {
    const acknowledged = commandTrackerReducer(sending(), {
      type: "ack",
      commandId: "cmd-1",
      status: "SUCCESS",
    });
    expect(acknowledged.status).toBe("waiting");
  });

  it("waiting -> success only on a terminal SUCCESS", () => {
    const state = commandTrackerReducer(waiting(), { type: "settle", status: "SUCCESS" });
    expect(state.status).toBe("success");
    expect(state.error).toBeNull();
  });

  it("waiting -> failed with the backend error message", () => {
    const state = commandTrackerReducer(waiting(), {
      type: "settle",
      status: "FAILED",
      error: "Thiết bị offline",
    });
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Thiết bị offline");
  });

  it("waiting -> timeout when the backend reports TIMEOUT", () => {
    const state = commandTrackerReducer(waiting(), { type: "settle", status: "TIMEOUT" });
    expect(state.status).toBe("timeout");
    expect(state.error).toBe(NO_DEVICE_RESPONSE);
  });

  it("waiting -> timeout when the client deadline is reached", () => {
    const state = commandTrackerReducer(waiting(), { type: "deadline" });
    expect(state.status).toBe("timeout");
    expect(state.error).toBe(NO_DEVICE_RESPONSE);
  });

  it("a transport error while waiting marks the command failed, never successful", () => {
    const state = commandTrackerReducer(waiting(), { type: "error", message: "Mạng lỗi" });
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Mạng lỗi");
  });

  it("ignores settle and deadline when nothing is in flight", () => {
    expect(commandTrackerReducer(initialCommandTrackerState, { type: "settle", status: "SUCCESS" })).toBe(
      initialCommandTrackerState,
    );
    expect(commandTrackerReducer(initialCommandTrackerState, { type: "deadline" })).toBe(
      initialCommandTrackerState,
    );
  });

  it("ignores a late deadline after the command already settled", () => {
    const settled = commandTrackerReducer(waiting(), { type: "settle", status: "SUCCESS" });
    expect(commandTrackerReducer(settled, { type: "deadline" })).toBe(settled);
  });

  it("adopts a command created elsewhere (voice) into the waiting phase", () => {
    const state = commandTrackerReducer(initialCommandTrackerState, {
      type: "adopt",
      commandId: "cmd-9",
    });
    expect(state).toMatchObject({ status: "waiting", commandId: "cmd-9", commandStatus: "PENDING" });
  });

  it("reset returns to the initial state", () => {
    expect(commandTrackerReducer(waiting(), { type: "reset" })).toEqual(initialCommandTrackerState);
  });
});