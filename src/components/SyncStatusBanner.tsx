"use client";

import { useState } from "react";
import { useData } from "@/lib/DataContext";
import type { OutboxEntry } from "@/lib/db/indexedDb";

const TABLE_LABEL: Record<string, string> = {
  food_items: "food item",
  supplement_items: "supplement item",
  symptom_items: "symptom item",
  habit_items: "habit item",
  workout_items: "workout item",
  food_logs: "food log entry",
  supplement_logs: "supplement log entry",
  symptom_logs: "symptom log entry",
  habit_logs: "habit log entry",
  food_diary: "food note",
  supplement_diary: "supplement note",
  symptom_diary: "symptom note",
  habit_diary: "habit note",
  workout_diary: "workout note",
  categories: "category",
  stool_logs: "stool entry",
  workout_logs: "workout entry",
  period_logs: "period entry",
  journal_entries: "journal entry",
  personal_notes: "note",
  personal_items: "expiring item",
};

function friendlyTable(table: string): string {
  return TABLE_LABEL[table] ?? "change";
}

/** Pulls a human-readable label out of the entry's own payload — the
 * `name` an item/category upsert carries, or the note/log's `date` — so
 * "a habit item didn't sync" becomes "Sleep well" didn't sync" instead of
 * forcing a guess at which of several identical-looking failures is which.
 * A delete's payload is just `{ id }`, and some upserts genuinely have
 * nothing better than that either — falls back to a short id fragment
 * rather than nothing. */
function describeRecord(entry: OutboxEntry): string {
  const payload = entry.payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.name === "string" && p.name.trim()) return p.name;
    if (typeof p.title === "string" && p.title.trim()) return p.title;
    if (typeof p.content === "string" && p.content.trim()) return p.content.length > 40 ? `${p.content.slice(0, 40)}…` : p.content;
    if (typeof p.body === "string" && p.body.trim()) return p.body.length > 40 ? `${p.body.slice(0, 40)}…` : p.body;
    if (typeof p.date === "string" && p.date.trim()) return p.date;
  }
  return entry.dedupeKey.split(":").at(-1)?.slice(0, 8) ?? "unknown";
}

/** Translates the Postgres/PostgREST error codes classifySupabaseError
 * treats as permanent (see lib/supabase/outbox.ts) into plain language —
 * never the raw error message, which can contain table/column names or
 * other implementation detail that isn't useful to a non-technical user.
 *
 * `op` matters because the same code means something different depending
 * on direction: a 23503 on an upsert means THIS record points at
 * something missing; a 23503 on a delete means something ELSE still
 * points at THIS record. `table` further splits the upsert case: an item
 * table (food/supplement/symptom/habit/workout _items) points at a
 * category, but a log/diary table points at its item instead — the app
 * auto-retries a dead-lettered log once its item gets a fresh chance (see
 * retryDependentDeadLetters in lib/supabase/sync.ts), so this is mostly
 * seen on entries stuck from before that existed. And a blind "Retry" is
 * never actually going to fix a 23505 — the exact same payload hits the
 * exact same name collision every time (see discardDeadLetterEntry's own
 * doc comment in outbox.ts) — so that one is honest about needing either a
 * rename or a Discard, never a claim that retrying alone will resolve it. */
function friendlyReason(code: string | undefined, op: "upsert" | "delete", table: string): { reason: string; action: string } {
  switch (code) {
    case "23503":
      if (op === "delete") return { reason: "something else still refers to it", action: "Move whatever's still using it elsewhere first, then retry." };
      return table.endsWith("_items")
        ? { reason: "it points to something (like a category) that's since been removed", action: "Check it still has a valid category, then retry." }
        : { reason: "the item it belongs to hasn't synced yet (its own sync failed too)", action: "Fix and retry that item first, then retry this." };
    case "23505":
      return {
        reason: "a duplicate of it already exists in your account",
        action: "Retrying alone won't fix this — rename it (or the other one) so they don't collide, then retry, or Discard if the other copy already has what you need.",
      };
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
  const { syncState, deadLetterEntries, retrySync, discardSync, isOnline } = useData();
  const offline = isOnline === false;
  const [expanded, setExpanded] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);

  if (syncState.deadLetter === 0 && syncState.pending === 0) return null;

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      await retrySync(id);
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDiscard(id: string) {
    setConfirmingDiscardId(null);
    setDiscardingId(id);
    try {
      await discardSync(id);
    } finally {
      setDiscardingId(null);
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
          <span className="ml-auto shrink-0 text-xs underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
            {expanded ? "Hide" : "Details"}
          </span>
        </button>
        {expanded && (
          <ul className="flex flex-col divide-y px-4 pb-2 sm:px-6 lg:px-8" style={{ borderColor: "var(--gridline)" }}>
            {deadLetterEntries.map((entry) => {
              const { reason, action } = friendlyReason(entry.lastErrorCode, entry.op, entry.table);
              const label = describeRecord(entry);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      &ldquo;{label}&rdquo;
                    </span>{" "}
                    ({friendlyTable(entry.table)}) didn&apos;t sync because {reason}. {action}
                  </span>
                  {confirmingDiscardId === entry.id ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span style={{ color: "var(--text-muted)" }}>Give up on the cloud copy?</span>
                      <button
                        type="button"
                        onClick={() => void handleDiscard(entry.id)}
                        className="rounded-md px-2 py-1 text-xs font-semibold"
                        style={{ color: "var(--status-critical)" }}
                      >
                        Discard
                      </button>
                      <button type="button" onClick={() => setConfirmingDiscardId(null)} className="rounded-md px-2 py-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRetry(entry.id)}
                        disabled={retryingId === entry.id || discardingId === entry.id}
                        className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                        style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                      >
                        {retryingId === entry.id ? "Retrying…" : "Retry"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDiscardId(entry.id)}
                        disabled={retryingId === entry.id || discardingId === entry.id}
                        title="Give up on syncing this one — the local copy on this device is untouched"
                        className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                        style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}
                      >
                        {discardingId === entry.id ? "Discarding…" : "Discard"}
                      </button>
                    </span>
                  )}
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
        {offline
          ? `Offline — ${syncState.pending} ${syncState.pending === 1 ? "change is" : "changes are"} saved on this device and will sync when you reconnect`
          : `${syncState.pending} ${syncState.pending === 1 ? "change" : "changes"} pending sync`}
      </span>
    </div>
  );
}
