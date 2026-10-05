import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const routerMock = { replace, push: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/login",
  useParams: () => ({}),
}));

import LoginPage from "@/app/login/page";
import { ApiError, type Http } from "@/lib/api/client";
import { setTransport } from "@/lib/api/transport";
import { resetMockStore } from "@/lib/mock/server";
import { DEMO_CREDENTIALS } from "@/lib/mock/fixtures";

beforeEach(() => {
  resetMockStore();
  replace.mockClear();
});

describe("AUTH-01/AUTH-02: login page", () => {
  it("AUTH-01: a valid login redirects to the dashboard", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), DEMO_CREDENTIALS.email);
    await user.clear(screen.getByLabelText("Mật khẩu"));
    await user.type(screen.getByLabelText("Mật khẩu"), DEMO_CREDENTIALS.password);
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  }, 20000);

  it("AUTH-02: a wrong password shows the Backend error and stays on /login", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.clear(screen.getByLabelText("Mật khẩu"));
    await user.type(screen.getByLabelText("Mật khẩu"), "sai-mat-khau");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng."),
    );
    expect(replace).not.toHaveBeenCalled();
  }, 20000);

  it("shows a loading state while the request is in flight", async () => {
    const slowTransport: Http = async <T,>(path: string): Promise<T> => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (path === "/api/auth/login") {
        return { user: { id: "user-1", email: DEMO_CREDENTIALS.email } } as T;
      }
      if (path === "/api/auth/me") throw new ApiError(401, "Chưa đăng nhập.");
      return {} as T;
    };
    setTransport(slowTransport);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    const pending = await screen.findByRole("button", { name: /Đang đăng nhập/ });
    expect(pending).toBeDisabled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    setTransport(null);
  }, 20000);
});