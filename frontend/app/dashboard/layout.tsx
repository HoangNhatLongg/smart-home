"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { VoiceDrawer } from "@/components/dashboard/VoiceDrawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { ToasterProvider } from "@/components/ui/Toaster";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { useSession } from "@/lib/hooks/useSession";
import { getApiMode } from "@/lib/api";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, user, signOut } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const apiMode = getApiMode();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  };

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-label="Đang kiểm tra phiên đăng nhập"
        className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-6 sm:px-6 lg:px-8"
      >
        <span className="sr-only">Đang kiểm tra phiên đăng nhập...</span>
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <ToasterProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            userEmail={user?.email ?? null}
            apiMode={apiMode}
            signingOut={signingOut}
            onToggleNav={() => setNavOpen((open) => !open)}
            onOpenVoice={() => setVoiceOpen(true)}
            onSignOut={onSignOut}
          />
          <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <VoiceDrawer open={voiceOpen} onClose={() => setVoiceOpen(false)}>
        <VoicePanel variant="drawer" />
      </VoiceDrawer>
    </ToasterProvider>
  );
}