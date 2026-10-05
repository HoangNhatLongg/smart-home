"use client";

import { Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { useSession } from "@/lib/hooks/useSession";
import { resolveApiMode } from "@/lib/api";
import { DEMO_CREDENTIALS } from "@/lib/mock/fixtures";

export default function LoginPage() {
  const router = useRouter();
  const { status, signIn, submitting, error } = useSession();
  // Demo credentials only exist in the in-memory mock Backend. In real mode the
  // user must type the credentials of an account in PostgreSQL.
  const isMockMode = resolveApiMode() === "mock";
  const [email, setEmail] = useState<string>(isMockMode ? DEMO_CREDENTIALS.email : "");
  const [password, setPassword] = useState<string>(isMockMode ? DEMO_CREDENTIALS.password : "");

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch {
      // The error is surfaced from the session controller.
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface">
          <Home size={20} strokeWidth={1.75} className="text-accent" aria-hidden />
        </span>
        <p className="text-xl font-semibold tracking-[-0.01em] text-ink">Nhà thông minh</p>
        <p className="text-sm text-ink-muted">Theo dõi và điều khiển thiết bị trong nhà của bạn.</p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5">
        <h2 className="text-[15px] font-semibold text-ink">Đăng nhập</h2>
        <p className="mt-0.5 mb-4 text-xs text-ink-subtle">Dùng tài khoản đã đăng ký cho ngôi nhà này.</p>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Mật khẩu"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner label="Đang đăng nhập" /> Đang đăng nhập...
              </>
            ) : (
              "Đăng nhập"
            )}
          </Button>
        </form>

        {isMockMode && (
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-subtle">
            Tài khoản thử nghiệm: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
          </p>
        )}
      </div>
    </main>
  );
}