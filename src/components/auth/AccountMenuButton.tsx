"use client";

import { useAuth } from "@/lib/supabase/AuthContext";
import { useData } from "@/lib/DataContext";
import { displayNameFromEmail } from "@/components/auth/AccountPanel";

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 16.4a6.3 6.3 0 0 1 12.4 0" />
    </svg>
  );
}

/** At-a-glance sync health on the account button: green once everything's
 * reached the cloud, muted while a change is still on its way (offline,
 * pending, mid-sync), amber if something failed and needs a look — full
 * detail is in the account panel this button opens. */
function useSyncDotColor(): string | null {
  const { syncState, syncing, isOnline } = useData();
  if (syncState.deadLetter > 0) return "var(--status-warning)";
  if (syncing || syncState.pending > 0 || !isOnline) return "var(--text-muted)";
  return "var(--status-good)";
}

/** The main menu's account entry — "Log in" when signed out, "Hi, name"
 * when signed in. Both states open the single shared AccountPanel. */
export function AccountMenuButton({ collapsed, onOpen }: { collapsed?: boolean; onOpen?: () => void }) {
  const { configured, session, loading, openPanel } = useAuth();
  const dotColor = useSyncDotColor();

  if (!configured || loading) return null;

  const label = session ? `Hi, ${displayNameFromEmail(session.user.email ?? "")}` : "Log in";

  function handleOpen() {
    onOpen?.();
    openPanel();
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        title={label}
        aria-label={label}
        className="relative flex h-9 w-9 items-center justify-center self-center rounded-full border"
        style={{
          borderColor: session ? "var(--border-hairline)" : "var(--series-1)",
          background: session ? "var(--page-plane)" : "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))",
          color: session ? "var(--text-secondary)" : "var(--series-1)",
        }}
      >
        <PersonIcon />
        {session && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2"
            style={{ background: dotColor ?? "transparent", ["--tw-ring-color" as string]: "var(--page-backdrop)" }}
          />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
      style={{
        borderColor: session ? "var(--border-hairline)" : "var(--series-1)",
        background: session ? "var(--page-plane)" : "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))",
        color: session ? "var(--text-primary)" : "var(--series-1)",
      }}
    >
      <PersonIcon />
      {label}
      {session && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor ?? "transparent" }} />}
    </button>
  );
}
