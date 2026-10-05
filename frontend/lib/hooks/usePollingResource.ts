"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";

export interface PollingResource<T> {
  data: T | null;
  error: string | null;
  /** True only for the very first load. */
  loading: boolean;
  lastUpdatedAt: number | null;
  refresh: () => void;
}

export interface PollingOptions {
  /** 0 disables polling. */
  intervalMs?: number;
  enabled?: boolean;
  /** Changing any value reloads the resource, e.g. a resolved home id. */
  deps?: unknown[];
}

/**
 * Loads a resource once and then re-reads it on an interval. Polling stops while
 * the tab is hidden so a backgrounded dashboard does not keep hammering the
 * Backend, and a failing poll keeps the last good `data` visible.
 */
export function usePollingResource<T>(
  loader: () => Promise<T>,
  { intervalMs = 10_000, enabled = true, deps = [] }: PollingOptions = {},
): PollingResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const run = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const next = await loaderRef.current();
      setData(next);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tải được dữ liệu.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const depsKey = JSON.stringify(deps ?? []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

const schedule = (delayMs: number, first = false) => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (!first && typeof document !== "undefined" && document.hidden) {
          schedule(intervalMs);
          return;
        }
        await run(false);
        if (intervalMs > 0) schedule(intervalMs);
      }, delayMs);
    };

    schedule(0, true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs, run, depsKey]);

  const refresh = useCallback(() => {
    // Background refreshes never blank the screen; `loading` is first-load only.
    void run(false);
  }, [run]);

  return { data, error, loading, lastUpdatedAt, refresh };
}