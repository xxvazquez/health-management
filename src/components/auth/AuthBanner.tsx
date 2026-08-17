"use client";

import { useAuth } from "@/lib/supabase/AuthContext";

/** Rendered once in the root layout, above every page's content — the only
 * "you're not signed in" messaging in the app. Points at the main menu's
 * account button rather than growing its own login form. */
export function AuthBanner() {
  const { configured, session, loading, openPanel } = useAuth();

  if (!configured || loading || session) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium sm:px-6 lg:px-8"
      style={{ borderColor: "var(--status-warning)", background: "color-mix(in oklab, var(--status-warning) 20%, var(--surface-1))" }}
    >
      <span style={{ color: "var(--text-primary)" }}>You&apos;re not logged in — log in to sync and save your data.</span>
      <button type="button" onClick={openPanel} className="shrink-0 underline decoration-dotted" style={{ color: "var(--text-primary)" }}>
        Log in
      </button>
    </div>
  );
}
