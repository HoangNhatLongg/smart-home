/**
 * The only place in the Frontend that performs network I/O.
 *
 * Transport rules (no contract change is implied by any of them):
 *  - `credentials: 'include'` so a Backend httpOnly session cookie is sent;
 *  - a bearer token is attached as a fallback if a login response ever carries
 *    one (API_SPEC §2 does not define the transport);
 *  - every failure is normalized to `ApiError` so components never parse
 *    response bodies themselves.
 */

import type { ApiErrorShape } from "./contract";
import { extractErrorMessage } from "./normalize";

export class ApiError extends Error implements ApiErrorShape {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequest {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** A transport: HTTP in `real` mode, the in-memory mock in `mock` mode. */
export type Http = <T>(path: string, request?: HttpRequest) => Promise<T>;

const DEFAULT_TIMEOUT_MS = 15000;

const STATUS_MESSAGES: Record<number, string> = {
  400: "Yêu cầu không hợp lệ.",
  401: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
  403: "Bạn không có quyền truy cập Home này.",
  404: "Không tìm thấy tài nguyên.",
  409: "Xung đột dữ liệu.",
  422: "Dữ liệu không hợp lệ.",
  500: "Lỗi máy chủ.",
  503: "Dịch vụ phụ thuộc đang không sẵn sàng.",
};

let bearerToken: string | null = null;

export function setBearerToken(token: string | null): void {
  bearerToken = token && token.trim() !== "" ? token : null;
}

export function getBearerToken(): string | null {
  return bearerToken;
}

/** URL path segment helper: device identifiers are used verbatim when possible. */
export function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function buildUrl(path: string, query: HttpRequest["query"]): string {
  const url = path.startsWith("/") ? path : `/${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function buildSignal(request: HttpRequest): Promise<AbortSignal | undefined> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof AbortSignal.timeout !== "function") return request.signal;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;
}

export const httpFetch: Http = async <T>(path: string, request: HttpRequest = {}) => {
  const { method = "GET", body, query } = request;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: await buildSignal(request),
  });

  const payload = await readBody(response);

  if (!response.ok) {
    const fallback = STATUS_MESSAGES[response.status] ?? `HTTP ${response.status}`;
    throw new ApiError(response.status, extractErrorMessage(payload, fallback));
  }

  return payload as T;
};

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;