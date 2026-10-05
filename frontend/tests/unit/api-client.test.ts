import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getBearerToken, httpFetch, setBearerToken } from "@/lib/api/client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setBearerToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setBearerToken(null);
});

describe("httpFetch", () => {
  it("sends credentials and no Authorization header before a token exists", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await httpFetch("/api/auth/me");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/me");
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("attaches a bearer token when one was handed out (auth transport fallback)", async () => {
    setBearerToken("token-123");
    expect(getBearerToken()).toBe("token-123");
    fetchMock.mockResolvedValue(jsonResponse({}));
    await httpFetch("/api/homes");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer token-123",
    );
  });

  it("builds query strings and skips empty parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await httpFetch("/api/devices/esp32-c3-001/telemetry", {
      query: { limit: 10, from: undefined, to: null },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/devices/esp32-c3-001/telemetry?limit=10");
  });

  it("serialises the JSON body and sets the content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ commandId: "cmd-1" }, 202));
    const result = await httpFetch<{ commandId: string }>("/api/devices/esp32-c3-001/commands", {
      method: "POST",
      body: { commandType: "set_relay", payload: { capability: "relay_1", state: true } },
    });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(
      JSON.stringify({ commandType: "set_relay", payload: { capability: "relay_1", state: true } }),
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(result.commandId).toBe("cmd-1");
  });

  it("normalizes error bodies into ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Email hoặc mật khẩu không đúng." }, 401));
    await expect(httpFetch("/api/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 401,
      message: "Email hoặc mật khẩu không đúng.",
    });
  });

  it("falls back to a localized message when the body carries none", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, 403));
    await expect(httpFetch("/api/homes/x/rooms")).rejects.toBeInstanceOf(ApiError);
    await expect(httpFetch("/api/homes/x/rooms")).rejects.toMatchObject({ status: 403 });
  });

  it("returns undefined for an empty body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(httpFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("passes an abort signal so a hung request cannot block the UI", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await httpFetch("/api/auth/me");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});