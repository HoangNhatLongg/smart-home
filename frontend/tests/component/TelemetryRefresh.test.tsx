import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDevice, normalizeTelemetry } from "@/lib/api/normalize";
import { TelemetryPanel } from "@/components/devices/TelemetryPanel";
import { RoomOverviewCard } from "@/components/dashboard/RoomOverviewCard";
import { resetDeviceTree, useDeviceTree } from "@/lib/hooks/useDeviceTree";

const api = vi.hoisted(() => ({
  listHomes: vi.fn(), listRooms: vi.fn(), listRoomDevices: vi.fn(),
  getDeviceState: vi.fn(), getTelemetry: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const onlineDevice = normalizeDevice({ deviceId: "node-1", roomId: "room-1", status: "online" })!;
const offlineDevice = normalizeDevice({ deviceId: "node-2", roomId: "room-1", status: "offline" })!;
const latest = { recordedAt: "2026-10-06T13:35:26Z", data: { temperature: 34, humidity: 66 } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetDeviceTree();
  api.listHomes.mockResolvedValue([{ id: "home-1" }]);
  api.listRooms.mockResolvedValue([{ id: "room-1", homeId: "home-1" }]);
  api.listRoomDevices.mockResolvedValue([onlineDevice]);
  api.getDeviceState.mockResolvedValue(null);
  api.getTelemetry.mockResolvedValue([latest]);
});
afterEach(() => { cleanup(); resetDeviceTree(); vi.useRealTimers(); });

describe("telemetry display and refresh", () => {
  it("shows newest reading when the backend returns descending history", () => {
    render(<TelemetryPanel points={normalizeTelemetry([
      latest,
      { recordedAt: "2026-10-06T10:00:00Z", data: { temperature: 21, humidity: 74 } },
    ])} />);
    expect(screen.getByText("34.0°C")).toBeInTheDocument();
    expect(screen.getByText("66%")).toBeInTheDocument();
    expect(screen.queryByText("21.0°C")).not.toBeInTheDocument();
  });

  it("excludes the offline node's epoch reading from room averages", () => {
    render(<RoomOverviewCard roomId="room-1" roomName="Phòng" devices={[onlineDevice, offlineDevice]}
      telemetry={{ "node-1": latest, "node-2": { recordedAt: "1970-01-01T00:39:32Z", data: { temperature: 0, humidity: 13.4 } } }} />);
    expect(screen.getByText("34.0°C")).toBeInTheDocument();
    expect(screen.getByText("66%")).toBeInTheDocument();
  });

  it("refetches on each poll and manual refresh despite a future device timestamp", async () => {
    api.getTelemetry.mockResolvedValueOnce([{ ...latest, recordedAt: "2099-01-01T00:00:00Z" }]);
    const { result } = renderHook(() => useDeviceTree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.getTelemetry).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(api.getTelemetry).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot?.telemetry["node-1"]?.recordedAt).toBe(latest.recordedAt);
    await act(async () => { result.current.refresh(); await vi.advanceTimersByTimeAsync(0); });
    expect(api.getTelemetry).toHaveBeenCalledTimes(3);
  });
});
