"use client";

import { useAuth } from "@/lib/supabase/AuthContext";
import { displayNameFromEmail } from "@/components/auth/AccountPanel";

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 16.4a6.3 6.3 0 0 1 12.4 0" />
    </svg>
  );
}

/** The main menu's account entry — "Log in" when signed out, "Hi, name"
 * when signed in. Both states open the single shared AccountPanel. */
export function AccountMenuButton({ collapsed }: { collapsed?: boolean }) {
  const { configured, session, loading, openPanel } = useAuth();

  if (!configured || loading) return null;

  const label = session ? `Hi, ${displayNameFromEmail(session.user.email ?? "")}` : "Log in";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={openPanel}
        title={label}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center self-center rounded-full border"
        style={{
          borderColor: session ? "var(--border-hairline)" : "var(--series-1)",
          background: session ? "var(--page-plane)" : "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))",
          color: session ? "var(--text-secondary)" : "var(--series-1)",
        }}
      >
        <PersonIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPanel}
      className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
      style={{
        borderColor: session ? "var(--border-hairline)" : "var(--series-1)",
        background: session ? "var(--page-plane)" : "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))",
        color: session ? "var(--text-primary)" : "var(--series-1)",
      }}
    >
      <PersonIcon />
      {label}
    </button>
  );
}
