import { setBearerToken } from "./client";
import { request } from "./transport";
import { isRecord, normalizeUser } from "./normalize";
import type { User } from "./contract";

/**
 * API_SPEC §2 does not define how the session travels. The Frontend sends the
 * cookie first (same-origin through the /api rewrite) and, only if a login
 * response ever carries a token, attaches it as a Bearer credential.
 */
function captureToken(payload: unknown): void {
  if (!isRecord(payload)) return;
  for (const key of ["accessToken", "access_token", "token"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      setBearerToken(value);
      return;
    }
  }
  const nested = payload.user;
  if (isRecord(nested)) captureToken(nested);
}

/** POST /api/auth/login — API_SPEC §2. */
export async function login(email: string, password: string): Promise<User> {
  const payload = await request<unknown>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const user = normalizeUser(payload);
  if (!user) throw new Error("Phản hồi đăng nhập không hợp lệ.");
  captureToken(payload);
  return user;
}

/** POST /api/auth/logout — API_SPEC §2. */
export async function logout(): Promise<void> {
  setBearerToken(null);
  await request<unknown>("/api/auth/logout", { method: "POST" });
}

/** GET /api/auth/me — API_SPEC §2. Used as the session gate. */
export async function me(): Promise<User | null> {
  try {
    return normalizeUser(await request<unknown>("/api/auth/me"));
  } catch {
    return null;
  }
}