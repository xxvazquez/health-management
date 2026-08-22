"use client";

import { useState } from "react";
import { useData } from "@/lib/DataContext";

const TABLE_LABEL: Record<string, string> = {
  food_items: "food item",
  supplement_items: "supplement item",
  symptom_items: "symptom item",
  habit_items: "habit item",
  food_logs: "food log entry",
  supplement_logs: "supplement log entry",
  symptom_logs: "symptom log entry",
  habit_logs: "habit log entry",
  food_diary: "food note",
  supplement_diary: "supplement note",
  symptom_diary: "symptom note",
  habit_diary: "habit note",
  categories: "category",
  stool_logs: "stool entry",
  workout_logs: "workout entry",
  period_logs: "period entry",
};

function friendlyTable(table: string): string {
  return TABLE_LABEL[table] ?? "change";
}

/** Translates the Postgres/PostgREST error codes classifySupabaseError
 * treats as permanent (see lib/supabase/outbox.ts) into plain language —
 * never the raw error message, which can contain table/column names or
 * other implementation detail that isn't useful to a non-technical user. */
function friendlyReason(code: string | undefined): { reason: string; action: string } {
  switch (code) {
    case "23503":
      return {
        reason: "it points to something (like a category) that's since been removed",
        action: "Check the item still has a valid category, then retry.",
      };
    case "23505":
      return { reason: "a duplicate of it already exists in your account", action: "Retry — this often clears up on its own." };
    case "23514":
      return { reason: "one of its values isn't valid", action: "Edit it and save again." };
    case "42501":
      return { reason: "of a permissions issue on your account", action: "Sign out and back in, then retry." };
    default:
      if (code?.startsWith("PGRST")) {
        return { reason: "the server didn't accept its format", action: "Retry — if it keeps failing, this needs a closer look." };
      }
      return { reason: "the server rejected it", action: "Retry." };
  }
}

/** Rendered once in the root layout, alongside AuthBanner — the only
 * surface for "some of your data hasn't reached Supabase yet". Not a toast
 * system: just enough to make outbox failures visible instead of silent.
 * Dead-letter entries take priority over a plain pending count, since
 * those need attention (they won't resolve on their own); a purely
 * pending queue is normal/expected while offline or mid-retry, so it's
 * shown quietly rather than as a warning.
 *
 * A dead-letter entry only means the CLOUD copy of one change is stuck —
 * the record itself is safely in this device's local storage regardless,
 * and stays there whether or not the retry below ever succeeds. */
export function SyncStatusBanner() {
  const { syncState, deadLetterEntries, retrySync } = useData();
  const [expanded, setExpanded] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  if (syncState.deadLetter === 0 && syncState.pending === 0) return null;

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      await retrySync(id);
    } finally {
      setRetryingId(null);
    }
  }

  if (syncState.deadLetter > 0) {
    return (
      <div className="border-b" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium sm:px-6 lg:px-8"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-warning)" }} />
          <span style={{ color: "var(--text-secondary)" }}>
            {syncState.deadLetter} {syncState.deadLetter === 1 ? "change" : "changes"} failed to back up to the cloud — still saved
            on this device
          </span>
          <span className="ml-auto shrink-0 text-[11px] underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
            {expanded ? "Hide" : "Details"}
          </span>
        </button>
        {expanded && (
          <ul className="flex flex-col divide-y px-4 pb-2 sm:px-6 lg:px-8" style={{ borderColor: "var(--gridline)" }}>
            {deadLetterEntries.map((entry) => {
              const { reason, action } = friendlyReason(entry.lastErrorCode);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>
                    A {friendlyTable(entry.table)} didn&apos;t sync because {reason}. {action}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRetry(entry.id)}
                    disabled={retryingId === entry.id}
                    className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                    style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                  >
                    {retryingId === entry.id ? "Retrying…" : "Retry"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
