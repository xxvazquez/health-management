"use client";

import { useAuth } from "@/lib/supabase/AuthContext";
import { Button } from "@/components/ui/Button";

/** Rendered once in the root layout, above every page's content — the only
 * "you're not signed in" messaging in the app. Points at the main menu's
 * account button rather than growing its own login form. */
export function AuthBanner() {
  const { configured, session, loading, openPanel } = useAuth();

  if (!configured || loading || session) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium sm:px-6 lg:px-8"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <span className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-warning)" }} />
        You&apos;re not logged in — log in to sync and save your data.
      </span>
      <Button variant="tinted" size="xs" onClick={openPanel} className="shrink-0">
        Log in
      </Button>
    </div>
  );
}
