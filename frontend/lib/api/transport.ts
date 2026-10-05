/**
 * Mode switch for `lib/api`. The only difference between mock and real mode.
 *
 * `NEXT_PUBLIC_API_MODE=real` uses the HTTP transport; anything else (including
 * an unset variable) uses the in-memory mock Backend. No component, page or hook
 * changes when the mode changes.
 */

import { httpFetch, type Http } from "./client";
import { mockHttp } from "@/lib/mock/server";

export type ApiMode = "mock" | "real";

export const resolveApiMode = (): ApiMode =>
  process.env.NEXT_PUBLIC_API_MODE === "real" ? "real" : "mock";

const initialTransport: Http = resolveApiMode() === "real" ? httpFetch : mockHttp;

let transport: Http = initialTransport;

/** Test seam: swap the transport, or pass `null` to restore the env default. */
export function setTransport(next: Http | null): void {
  transport = next ?? (resolveApiMode() === "real" ? httpFetch : mockHttp);
}

export function getTransport(): Http {
  return transport;
}

export const getApiMode = (): ApiMode => resolveApiMode();

export function request<T>(path: string, init?: Parameters<Http>[1]): Promise<T> {
  return transport<T>(path, init);
}