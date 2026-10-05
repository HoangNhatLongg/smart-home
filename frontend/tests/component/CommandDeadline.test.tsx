import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError, type Http } from "@/lib/api/client";
import { setTransport } from "@/lib/api/transport";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";

/**
 * Decision 5: a command is only "done" on a terminal status from
 * GET /api/commands/:commandId. When nothing answers, the client deadline ends
 * the loop and the UI says the device did not respond.
 */
function DeadlineHarness() {
  const tracker = useCommandTracker({ intervalMs: 20, deadlineMs: 120 });
  return (
    <div>
      <button type="button" onClick={() => void tracker.requestRelay("d1", "relay_1", true)}>
        Bật
      </button>
      <p data-testid="status">{tracker.status}</p>
      <p data-testid="error">{tracker.error ?? ""}</p>
    </div>
  );
}

const stuckTransport: Http = async <T,>(path: string): Promise<T> => {
  if (path.endsWith("/commands")) {
    return { commandId: "cmd-stuck", status: "PENDING" } as T;
  }
  if (path === "/api/commands/cmd-stuck") {
    // The Broker delivered the command but no matching State ever arrives.
    return { commandId: "cmd-stuck", status: "SENT", retryCount: 2 } as T;
  }
  throw new ApiError(404, `no mock route for ${path}`);
};

afterEach(() => setTransport(null));

describe("command tracker deadline", () => {
  it("ends in timeout and never reports success", async () => {
    setTransport(stuckTransport);
    const user = userEvent.setup();
    render(<DeadlineHarness />);

    await user.click(screen.getByRole("button", { name: "Bật" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("waiting"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("timeout"), {
      timeout: 5000,
    });
    expect(screen.getByTestId("error")).toHaveTextContent("Thiết bị không phản hồi.");
    expect(screen.getByTestId("status")).not.toHaveTextContent("success");
  });
});
