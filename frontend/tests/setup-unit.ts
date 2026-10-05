import { afterEach, vi } from "vitest";

// Every case starts from a clean mock backend session so an authenticated case
// never leaks into the next one.
afterEach(() => {
  vi.useRealTimers();
});