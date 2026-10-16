"use client";

import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { Sheet } from "@/components/ui/Sheet";
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

/** How long a change can be in flight before it's worth mentioning. Every
 * tap queues one and it normally syncs within a second. */
const PENDING_GRACE_MS = 10_000;

export interface SyncStatus {
  tone: "warning" | "muted";
  label: string;
}

/** What, if anything, is worth saying about sync right now: failed changes
 * at once (they won't resolve on their own), pending ones only once they've
 * waited past the grace period. Null when there's nothing to show. */
export function useSyncStatus(): SyncStatus | null {
  const { syncState, pendingEntries, isOnline } = useData();
  const oldestPendingAt = pendingEntries.reduce((oldest, e) => Math.min(oldest, e.createdAt), Infinity);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(oldestPendingAt)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, oldestPendingAt + PENDING_GRACE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [oldestPendingAt]);

  const { deadLetter, pending } = syncState;
  if (deadLetter > 0) return { tone: "warning", label: `${deadLetter} ${deadLetter === 1 ? "change" : "changes"} didn't back up` };
  const pendingSettled = Number.isFinite(oldestPendingAt) && now - oldestPendingAt >= PENDING_GRACE_MS;
  if (pending === 0 || !pendingSettled) return null;
  const waiting = `${pending} ${pending === 1 ? "change" : "changes"} waiting`;
  return { tone: "muted", label: isOnline === false ? `Offline · ${waiting}` : `${waiting} to sync` };
}

export function syncStatusColor(status: SyncStatus): string {
  return status.tone === "warning" ? "var(--status-warning)" : "var(--text-muted)";
}

/** Everything behind the status: failed changes with Retry / Discard, then
 * what's still waiting. A failed change only means the CLOUD copy is stuck —
 * the record itself is safely in this device's storage either way. */
export function SyncDetailsSheet({ onClose }: { onClose: () => void }) {
  const { deadLetterEntries, pendingEntries, retrySync, retryPending, discardSync, isOnline } = useData();
  const offline = isOnline === false;
  const [retryingPending, setRetryingPending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);
  const [itemNames, setItemNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    // Reads the local cache so a log can be shown under its item's name.
    void getAllItems().then((items) => setItemNames(new Map(items.map((i) => [i.identity, i.rawName]))));
  }, []);

  const lastAttempt = pendingEntries.filter((e) => e.lastError).sort((a, b) => b.nextAttemptAt - a.nextAttemptAt)[0];
  const lastProblem = lastAttempt ? `${lastAttempt.lastErrorCode ? `${lastAttempt.lastErrorCode}: ` : ""}${lastAttempt.lastError}` : null;

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

  return (
    <Sheet title="Cloud backup" titleId="sync-details-title" onClose={onClose}>
      {deadLetterEntries.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="px-1 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Didn&apos;t back up — still saved on this device
          </h3>
          <ul className="inset-rows flex flex-col rounded-xl px-3.5" style={{ background: "var(--surface-1)" }}>
            {deadLetterEntries.map((entry) => {
              const { reason, action } = friendlyReason(entry.lastErrorCode, entry.op, entry.table);
              const { title, kind, details } = describeOutboxEntry(entry, itemNames);
              return (
                <li key={entry.id} className="flex flex-col gap-2 py-3 text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      &ldquo;{title}&rdquo;
                    </span>{" "}
                    ({kind.toLowerCase()}
                    {details.length > 0 ? `, ${details.join(", ")}` : ""}, saved {formatSavedAt(entry.createdAt)}) didn&apos;t sync because {reason}. {action}
                  </span>
                  <span className="flex gap-1.5">
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
                  {confirmingDiscardId === entry.id && (
                    <ConfirmDialog
                      title="Discard this change?"
                      message="It won't be saved to your account. The copy on this device stays."
                      confirmLabel="Discard"
                      destructive
                      onConfirm={() => void handleDiscard(entry.id)}
                      onClose={() => setConfirmingDiscardId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pendingEntries.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              {offline ? "Offline — waiting to sync" : "Waiting to sync"}
            </h3>
            {!offline && (
              <button
                type="button"
                onClick={() => void handleRetryPending()}
                disabled={retryingPending}
                className="shrink-0 text-xs font-medium disabled:opacity-50"
                style={{ color: "var(--ui-accent)" }}
              >
                {retryingPending ? "Retrying…" : "Retry now"}
              </button>
            )}
          </div>
          <p className="px-1 pb-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            Kept on this device and sent automatically.{" "}
            <button type="button" onClick={() => saveCopy(pendingEntries)} className="font-medium" style={{ color: "var(--ui-accent)" }}>
              Save a Copy
            </button>
          </p>
          {lastProblem && (
            <p className="px-1 pb-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Latest problem: {lastProblem}
            </p>
          )}
          <ul className="inset-rows flex flex-col rounded-xl px-3.5" style={{ background: "var(--surface-1)" }}>
            {[...pendingEntries]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((entry) => {
                const { title, kind, details } = describeOutboxEntry(entry, itemNames);
                return (
                  <li key={entry.id} className="py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
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
        </section>
      )}

      {deadLetterEntries.length === 0 && pendingEntries.length === 0 && (
        <p className="px-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Everything is backed up.
        </p>
      )}
    </Sheet>
  );
}

/** Phone only: a small control floating just above the tab bar, out of the
 * page flow so it never moves content. Tap for the details sheet. On
 * desktop the sidebar footer shows the same status. */
export function FloatingSyncStatus() {
  const status = useSyncStatus();
  const [open, setOpen] = useState(false);
  return (
    <>
      {status && (
        <div
          className="fixed left-1/2 z-20 max-w-[calc(100vw-2rem)] -translate-x-1/2 lg:hidden print:hidden"
          style={{ bottom: "calc(58px + env(safe-area-inset-bottom) + 0.5rem)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="hit-slop flex min-h-8 max-w-full items-center gap-1.5 rounded-[10px] border px-3 text-xs font-medium shadow-md"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: syncStatusColor(status) }} aria-hidden="true" />
            <span className="truncate">{status.label}</span>
          </button>
        </div>
      )}
      {open && <SyncDetailsSheet onClose={() => setOpen(false)} />}
    </>
  );
}
