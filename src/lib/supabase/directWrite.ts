import { supabase } from "./client";
import { classifySupabaseError } from "./outbox";
import { enqueueOutbox, type OutboxOperation } from "@/lib/db/indexedDb";

function notConfigured(): Error {
  return new Error("Cloud sync isn't set up for this deployment.");
}

/**
 * A write for one of the direct-to-Supabase features (Journal today; the
 * same helper is meant for Messages/Doctors/Personal/Care Log/Wishlist/
 * Labs/Vitals as they're wired up). These features hold no local
 * IndexedDB mirror — a call site builds the *complete* row (the caller
 * generates the id, so an offline write and its eventual synced copy are
 * the same record) and this tries it directly.
 *
 * A write Postgres itself rejects for a real reason (a check/RLS/foreign-
 * key violation) throws, same as before — the caller shows that error.
 * A write that can't reach the server at all (offline, a dropped
 * connection, or a transient 5xx) is queued in the same outbox the
 * tracking domains use instead of being lost: `enqueueOutbox`'s dedupe
 * collapses a later write for the same record into the still-pending
 * entry, so an edit made offline right after an offline create just
 * replaces that create's payload rather than queuing twice. The next
 * outbox drain (tab focus, reconnect, the periodic pull timer — see
 * sync.ts's pullFromCloud) sends it, and the existing SyncStatusBanner
 * already surfaces pending/failed entries for any table, so nothing else
 * needs to know this happened.
 */
async function attemptOrQueue(userId: string, table: string, id: string, op: OutboxOperation, payload: Record<string, unknown>): Promise<void> {
  if (!supabase) throw notConfigured();
  let serverError: { code?: string; message: string } | null = null;
  let unreachable = false;
  try {
    const query = supabase.from(table);
    let error;
    if (op === "upsert") {
      ({ error } = await query.upsert(payload));
    } else if (op === "insert") {
      ({ error } = await query.upsert(payload, { ignoreDuplicates: true }));
    } else if (op === "update") {
      const rest = { ...payload };
      delete rest.id;
      ({ error } = await query.update(rest).eq("id", id));
    } else {
      const match = (payload as { match?: Record<string, unknown> }).match;
      ({ error } = match ? await query.delete().match(match) : await query.delete().eq("id", id));
    }
    if (error) serverError = error;
  } catch {
    // Never actually reached the server — offline, a dropped connection,
    // a CORS/DNS failure. Always queue, never surface to the caller.
    unreachable = true;
  }
  if (serverError) {
    if (classifySupabaseError(serverError).outcome === "permanent") throw new Error(serverError.message);
    // A retryable *server* error (a transient 5xx, a timeout Postgres itself
    // reported) — still queue it rather than surface a one-off failure.
  } else if (!unreachable) {
    return;
  }
  await enqueueOutbox({ userId, dedupeKey: `${table}:${id}`, table, op, payload });
}

export function upsertDirect(userId: string, table: string, id: string, payload: Record<string, unknown>): Promise<void> {
  return attemptOrQueue(userId, table, id, "upsert", payload);
}

/**
 * An edit sent as `update … where id = …` rather than an upsert — for the
 * pair-visible tables (`household_*`, `wishlist_*`), where the row may be
 * owned by the linked partner and an upsert's INSERT with-check
 * (`owner_id = auth.uid()`) would reject it. `fullRow` is the complete row
 * (same as `upsertDirect` takes) so an offline edit still merges cleanly
 * into a still-unsent create for the same record. Creates on these tables
 * stay on `upsertDirect` — a create is always your own row.
 */
export function updateDirect(userId: string, table: string, id: string, fullRow: Record<string, unknown>): Promise<void> {
  return attemptOrQueue(userId, table, id, "update", { ...fullRow, id });
}

export function deleteDirect(userId: string, table: string, id: string): Promise<void> {
  return attemptOrQueue(userId, table, id, "delete", { id });
}

/** A stable dedupe id for a row addressed by a composite natural key, so
 * `insertDirect` and `deleteWhereDirect` for the same row agree. */
function matchKey(match: Record<string, string>): string {
  return Object.keys(match)
    .sort()
    .map((k) => `${k}=${match[k]}`)
    .join("&");
}

/**
 * An insert that's a no-op on conflict (`ON CONFLICT DO NOTHING`) — for a
 * write-once row: a pure join row (`care_entry_specialties`) or an
 * immutable log row (`*_task_completions`). `household_task_completions`
 * has no update policy (a completion is immutable), so a plain
 * `upsertDirect` fails there and a redelivered send after a lost ack would
 * spuriously dead-letter. The idempotency belongs at the write, not in a
 * loosened policy. `match` is the row's natural key; it also keys the
 * outbox entry so an offline add-then-remove of the same row cancels
 * against `deleteWhereDirect`.
 */
export function insertDirect(userId: string, table: string, match: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  return attemptOrQueue(userId, table, matchKey(match), "insert", payload);
}

/**
 * Delete by a column match instead of an id — for a pure join / log row
 * with no surrogate id of its own, only a composite natural key the caller
 * always knows. Keyed the same way `insertDirect` keys its entry.
 */
export function deleteWhereDirect(userId: string, table: string, match: Record<string, string>): Promise<void> {
  return attemptOrQueue(userId, table, matchKey(match), "delete", { match });
}
