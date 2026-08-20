"use client";

import { useData } from "@/lib/DataContext";

/** Rendered once in the root layout, alongside AuthBanner — the only
 * surface for "some of your data hasn't reached Supabase yet". Not a toast
 * system: just enough to make outbox failures visible instead of silent.
 * Dead-letter entries take priority over a plain pending count, since
 * those need attention (they won't resolve on their own); a purely
 * pending queue is normal/expected while offline or mid-retry, so it's
 * shown quietly rather than as a warning. */
export function SyncStatusBanner() {
  const { syncState } = useData();

  if (syncState.deadLetter === 0 && syncState.pending === 0) return null;

  if (syncState.deadLetter > 0) {
    return (
      <div
        className="flex items-center gap-2 border-b px-4 py-2 text-xs font-medium sm:px-6 lg:px-8"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-warning)" }} />
        <span style={{ color: "var(--text-secondary)" }}>
          {syncState.deadLetter} {syncState.deadLetter === 1 ? "change" : "changes"} failed to sync
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 border-b px-4 py-2 text-xs font-medium sm:px-6 lg:px-8"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--text-muted)" }} />
      <span style={{ color: "var(--text-secondary)" }}>
        {syncState.pending} {syncState.pending === 1 ? "change" : "changes"} pending sync
      </span>
    </div>
  );
}
