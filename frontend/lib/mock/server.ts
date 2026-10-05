/**
 * In-memory mock Backend used when `NEXT_PUBLIC_API_MODE` is not `real`.
 *
 * It implements the API_SPEC.md surface in-process, so the dashboard is fully
 * demonstrable before any Backend exists. It never performs network I/O.
 */

import type { Http, HttpRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { createMockStore, type MockStore } from "./fixtures";
import { findRoute, type MockRequest, type MockResponse } from "./handlers";

let store: MockStore = createMockStore();

/** Test/dev seam: rebuild the store and drop any simulated Backend session. */
export function resetMockStore(now = Date.now()): MockStore {
  store = createMockStore(now);
  return store;
}

export function getMockStore(): MockStore {
  return store;
}

function parseRequest(path: string, init: HttpRequest = {}): MockRequest {
  const [pathname, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  return {
    method: init.method ?? "GET",
    path: pathname,
    query,
    body: init.body,
  };
}

export const MOCK_LATENCY_MS = 120;

/** Simulates Backend latency so Loading states are observable in mock mode. */
function delay(): Promise<void> {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

export const mockHttp: Http = async <T>(path: string, init: HttpRequest = {}): Promise<T> => {
  await delay();
  const request = parseRequest(path, init);
  const matched = findRoute(request.method, request.path);
  if (!matched) {
    throw new ApiError(404, `Mock Backend: không hỗ trợ ${request.method} ${request.path}`);
  }
  const response: MockResponse = matched.route.handler(store, request, matched.params);
  return response.body as T;
};