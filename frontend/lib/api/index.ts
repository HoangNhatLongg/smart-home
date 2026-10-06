/**
 * Single entry point for data access.
 *
 * Components and hooks import from here only. No component ever calls `fetch`,
 * imports `lib/mock/*`, or sees a raw Backend response.
 */

export * from "./contract";
export { ApiError, isApiError, setBearerToken, segment, type Http } from "./client";
export { getApiMode, resolveApiMode, request, setTransport, type ApiMode } from "./transport";
export * from "./auth";
export * from "./homes";
export * from "./rooms";
export * from "./devices";
export * from "./telemetry";
export * from "./commands";
export * from "./configuration";
export * from "./automation";
export * from "./ota";
export * from "./voice";
export * from "./pairing";
