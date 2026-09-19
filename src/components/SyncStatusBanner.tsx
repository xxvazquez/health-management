"use client";

import { Chip } from "@/components/ui/Chip";
import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { ChevronIcon } from "@/components/ui/icons";
import { getAllItems, type OutboxEntry, type OutboxOperation } from "@/lib/db/indexedDb";
import { describeOutboxEntry, formatSavedAt } from "@/lib/supabase/describeOutboxEntry";

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
function friendlyReason(code: string | undefined, op: OutboxOperation, table: string): { reason: string; action: string } {
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
    case "LOCAL_DAMAGED":
      return { reason: "its saved copy on this device is damaged", action: "It can't be sent — Discard it and enter the change again." };
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
  const { syncState, deadLetterEntries, pendingEntries, retrySync, retryPending, discardSync, isOnline } = useData();
  const offline = isOnline === false;
  const [expanded, setExpanded] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const [retryingPending, setRetryingPending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);

  const [itemNames, setItemNames] = useState<Map<string, string>>(new Map());
  const listOpen = expanded || pendingExpanded;
  useEffect(() => {
    if (!listOpen) return;
    // Reads the local cache so a log can be shown under its item's name.
    void getAllItems().then((items) => setItemNames(new Map(items.map((i) => [i.identity, i.rawName]))));
  }, [listOpen]);

  if (syncState.deadLetter === 0 && syncState.pending === 0) return null;

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      await retrySync(id);
    } finally {
      setRetryingId(null);
    }
  }

  function saveCopy(entries: OutboxEntry[]) {
    const rows = entries.map((entry) => ({
      ...describeOutboxEntry(entry, itemNames),
      savedAt: new Date(entry.createdAt).toISOString(),
      table: entry.table,
      op: entry.op,
      data: entry.payload,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lauva-unsynced-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleRetryPending() {
    setRetryingPending(true);
    try {
      await retryPending();
    } finally {
      setRetryingPending(false);
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
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {expanded ? "Hide" : "Details"}
            <ChevronIcon dir={expanded ? "up" : "down"} size={12} />
          </span>
        </button>
        {expanded && (
          <ul className="flex flex-col inset-rows px-4 pb-2 sm:px-6 lg:px-8">
            {deadLetterEntries.map((entry) => {
              const { reason, action } = friendlyReason(entry.lastErrorCode, entry.op, entry.table);
              const { title, kind, details } = describeOutboxEntry(entry, itemNames);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      &ldquo;{title}&rdquo;
                    </span>{" "}
                    ({kind.toLowerCase()}
                    {details.length > 0 ? `, ${details.join(", ")}` : ""}, saved {formatSavedAt(entry.createdAt)}) didn&apos;t sync because {reason}. {action}
                  </span>
                  {confirmingDiscardId === entry.id ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span style={{ color: "var(--text-muted)" }}>Give up on the cloud copy?</span>
                      <button
                        type="button"
                        onClick={() => void handleDiscard(entry.id)}
                        className="min-h-9 rounded-md px-3 text-sm font-semibold"
                        style={{ color: "var(--status-critical)" }}
                      >
                        Discard
                      </button>
                      <button type="button" onClick={() => setConfirmingDiscardId(null)} className="min-h-9 rounded-md px-3 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 gap-1.5">
                      <Chip onClick={() => void handleRetry(entry.id)} disabled={retryingId === entry.id || discardingId === entry.id}>
                        {retryingId === entry.id ? "Retrying…" : "Retry"}
                      </Chip>
                      <Chip
                        onClick={() => setConfirmingDiscardId(entry.id)}
                        disabled={retryingId === entry.id || discardingId === entry.id}
                        title="Give up on syncing this one — the local copy on this device is untouched"
                      >
                        {discardingId === entry.id ? "Discarding…" : "Discard"}
                      </Chip>
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
    <div className="border-b" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <div className="flex items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setPendingExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-xs font-medium"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--text-muted)" }} />
          <span style={{ color: "var(--text-secondary)" }}>
            {offline
              ? `Offline — ${syncState.pending} ${syncState.pending === 1 ? "change is" : "changes are"} saved on this device and will sync when you reconnect`
              : `${syncState.pending} ${syncState.pending === 1 ? "change" : "changes"} pending sync`}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {pendingExpanded ? "Hide" : "Details"}
            <ChevronIcon dir={pendingExpanded ? "up" : "down"} size={12} />
          </span>
        </button>
        {!offline && (
          <Chip onClick={() => void handleRetryPending()} disabled={retryingPending}>
            {retryingPending ? "Retrying…" : "Retry now"}
          </Chip>
        )}
      </div>
      {pendingExpanded && (
        <div className="px-4 pb-2 sm:px-6 lg:px-8">
          <p className="pb-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Everything below is saved on this device — nothing is lost. It will be sent to the cloud automatically.{" "}
            <button type="button" onClick={() => saveCopy(pendingEntries)} className="font-medium" style={{ color: "var(--series-1)" }}>
              Save a copy as a file
            </button>
          </p>
          <ul className="flex flex-col inset-rows">
            {[...pendingEntries]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((entry) => {
                const { title, kind, details } = describeOutboxEntry(entry, itemNames);
                return (
                  <li key={entry.id} className="py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <div>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {title}
                      </span>{" "}
                      · {kind}
                      {details.length > 0 ? ` · ${details.join(" · ")}` : ""}
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                      Saved on this device {formatSavedAt(entry.createdAt)}
                      {entry.attempts > 0 ? ` · tried ${entry.attempts} ${entry.attempts === 1 ? "time" : "times"}` : " · not sent yet"}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
