"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { login as apiLogin, logout as apiLogout, me } from "@/lib/api";
import type { User } from "@/lib/api/contract";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface SessionController {
  status: SessionStatus;
  user: User | null;
  error: string | null;
  submitting: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Session bootstrap.
 *
 * API_SPEC §2 defines only `GET /api/auth/me`, and the session cookie name is
 * not part of the contract, so there is no route middleware: every page asks
 * `/api/auth/me` once and redirects to /login when it is unauthenticated.
 */
export function useSession(): SessionController {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const current = await me();
    setUser(current);
    setStatus(current ? "authenticated" : "unauthenticated");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await me();
        if (cancelled) return;
        setUser(current);
        setStatus(current ? "authenticated" : "unauthenticated");
      } catch {
        if (cancelled) return;
        setUser(null);
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const authenticated = await apiLogin(email, password);
      setUser(authenticated);
      setStatus("authenticated");
      return authenticated;
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : "Đăng nhập thất bại, vui lòng thử lại.";
      setError(message);
      setStatus("unauthenticated");
      throw cause;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  return { status, user, error, submitting, signIn, signOut, refresh };
}