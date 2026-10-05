import { request } from "./transport";
import { normalizeHome, normalizeHomes } from "./normalize";
import type { Home } from "./contract";

/** GET /api/homes — API_SPEC §3. */
export async function listHomes(): Promise<Home[]> {
  return normalizeHomes(await request<unknown>("/api/homes"));
}

/** GET /api/homes/:homeId — API_SPEC §3. */
export async function getHome(homeId: string): Promise<Home | null> {
  return normalizeHome(await request<unknown>(`/api/homes/${encodeURIComponent(homeId)}`));
}

/** POST /api/homes — API_SPEC §3. */
export async function createHome(name: string): Promise<Home | null> {
  return normalizeHome(
    await request<unknown>("/api/homes", { method: "POST", body: { name } }),
  );
}

/** PUT /api/homes/:homeId — API_SPEC §3. */
export async function updateHome(homeId: string, name: string): Promise<Home | null> {
  return normalizeHome(
    await request<unknown>(`/api/homes/${encodeURIComponent(homeId)}`, {
      method: "PUT",
      body: { name },
    }),
  );
}