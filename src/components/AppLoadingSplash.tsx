"use client";

import { useAuth } from "@/lib/supabase/AuthContext";
import { Logo } from "@/components/Logo";

/**
 * Covers the screen while the first auth check runs, so a cold start (or a
 * PWA launch) shows the mark rather than a flash of the signed-out banner
 * and example data. Clears itself the moment auth resolves — every page
 * then shows its own skeleton while data loads.
 */
export function AppLoadingSplash() {
  const { loading } = useAuth();
  if (!loading) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3"
      style={{ background: "var(--page-backdrop)" }}
      role="status"
      aria-label="Loading Lauva"
    >
      <span className="animate-pulse">
        <Logo size={44} />
      </span>
      <span className="text-sm font-medium tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
        LAUVA
      </span>
    </div>
  );
}
