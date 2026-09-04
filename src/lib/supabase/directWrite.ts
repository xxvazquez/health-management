import { supabase } from "./client";
import { classifySupabaseError } from "./outbox";
import { enqueueOutbox } from "@/lib/db/indexedDb";

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
async function attemptOrQueue(userId: string, table: string, id: string, op: "upsert" | "delete", payload: Record<string, unknown>): Promise<void> {
  if (!supabase) throw notConfigured();
  let serverError: { code?: string; message: string } | null = null;
  let unreachable = false;
  try {
    const query = supabase.from(table);
    const { error } = op === "upsert" ? await query.upsert(payload) : await query.delete().eq("id", id);
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

export function deleteDirect(userId: string, table: string, id: string): Promise<void> {
  return attemptOrQueue(userId, table, id, "delete", { id });
}
