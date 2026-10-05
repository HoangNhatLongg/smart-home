import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/devices",
  useParams: () => ({}),
}));

import { RelayToggle } from "@/components/devices/RelayToggle";
import { getDevice, getDeviceState, login } from "@/lib/api";
import { getMockStore, resetMockStore } from "@/lib/mock/server";
import { DEMO_CREDENTIALS } from "@/lib/mock/fixtures";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import type { Device, DeviceCapability } from "@/lib/api/contract";

const ONLINE_DEVICE = "esp32-c3-001";
const TRACK_POLL_MS = 50;

function relayOf(device: Device): DeviceCapability {
  const capability = device.capabilities.find((item) => item.code === "relay");
  if (!capability) throw new Error(`${device.deviceId} has no relay`);
  return capability;
}

/** The device detail flow: state comes from the API, the command from the tracker. */
function RelayHarness({ deviceId }: { deviceId: string }) {
  const deviceResource = usePollingResource(() => getDevice(deviceId), { intervalMs: 0 });
  const stateResource = usePollingResource(() => getDeviceState(deviceId), { intervalMs: 0 });
  const tracker = useCommandTracker({
    intervalMs: TRACK_POLL_MS,
    onConfirmed: () => stateResource.refresh(),
  });

  const device = deviceResource.data;
  if (!device) return <p>Đang tải thiết bị...</p>;
  const capability = device.capabilities.find((item) => item.code === "relay");
  if (!capability) return <p>Thiết bị không có relay.</p>;
  const raw = stateResource.data?.state?.[capability.instanceCode];

  return (
    <RelayToggle
      device={device}
      capability={capability}
      value={typeof raw === "boolean" ? raw : null}
      tracker={tracker}
    />
  );
}

/** A device that stays "online" in the UI while the store says otherwise. */
function StuckDeviceHarness({ device }: { device: Device }) {
  const tracker = useCommandTracker({ intervalMs: TRACK_POLL_MS });
  return (
    <RelayToggle
      device={device}
      capability={relayOf(device)}
      value={false}
      tracker={tracker}
    />
  );
}

const relaySwitch = () => screen.getByRole("switch");
const waiting = () => screen.queryByText("Đang chờ thiết bị phản hồi...");

beforeEach(async () => {
  resetMockStore();
  await login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
});

describe("CMD-01/CMD-02: relay toggle only reflects confirmed State", () => {
  it("waits for the device confirmation and only then flips the switch", async () => {
    const user = userEvent.setup();
    render(<RelayHarness deviceId={ONLINE_DEVICE} />);

    const control = await waitFor(() => relaySwitch());
    expect(control).toHaveAttribute("aria-checked", "false");

    await user.click(control);

    // Invariant 1: a 200/202 POST response must never be rendered as "ON".
    await waitFor(() => expect(waiting()).toBeInTheDocument());
    expect(relaySwitch()).toHaveAttribute("aria-checked", "false");
    expect(relaySwitch()).toBeDisabled();

    await waitFor(() => expect(screen.getByText("Thiết bị đã xác nhận.")).toBeInTheDocument(), {
      timeout: 15000,
    });
    await waitFor(() => expect(relaySwitch()).toHaveAttribute("aria-checked", "true"), {
      timeout: 15000,
    });
  }, 30000);

  it("toggling back off follows the same confirmation path", async () => {
    const user = userEvent.setup();
    render(<RelayHarness deviceId={ONLINE_DEVICE} />);

    await waitFor(() => relaySwitch());
    await user.click(relaySwitch());
    await waitFor(() => expect(screen.getByText("Thiết bị đã xác nhận.")).toBeInTheDocument(), {
      timeout: 15000,
    });

    await user.click(relaySwitch());
    await waitFor(() => expect(waiting()).toBeInTheDocument());
    expect(relaySwitch()).toHaveAttribute("aria-checked", "true");

    await waitFor(() => expect(relaySwitch()).toHaveAttribute("aria-checked", "false"), {
      timeout: 15000,
    });
  }, 40000);
});

describe("CMD-04: an offline device is not commanded at all", () => {
  it("disables the toggle and explains why", async () => {
    const stored = getMockStore().devices.find((item) => item.deviceId === ONLINE_DEVICE);
    if (stored) stored.status = "offline";

    render(<RelayHarness deviceId={ONLINE_DEVICE} />);
    const control = await waitFor(() => relaySwitch());
    expect(control).toBeDisabled();
    expect(screen.getByText("Thiết bị offline, không gửi lệnh.")).toBeInTheDocument();
  });
});

describe("CMD-03: a command without a State confirmation fails", () => {
  it("keeps the last confirmed state and reports the failure", async () => {
    const user = userEvent.setup();
    const device = (await getDevice(ONLINE_DEVICE)) as Device;

    render(<StuckDeviceHarness device={device} />);
    const control = await waitFor(() => relaySwitch());
    await user.click(control);

    // The device drops offline right after the Backend accepted the command.
    const stored = getMockStore().devices.find((item) => item.deviceId === ONLINE_DEVICE);
    if (stored) stored.status = "offline";

    await waitFor(
      () =>
        expect(
          screen.getByText("Thiết bị offline, command không thể gửi."),
        ).toBeInTheDocument(),
      { timeout: 15000 },
    );
    expect(screen.queryByText("Thiết bị đã xác nhận.")).not.toBeInTheDocument();
    expect(relaySwitch()).toHaveAttribute("aria-checked", "false");
  }, 30000);
});