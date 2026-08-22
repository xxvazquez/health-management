import { supabase } from "./client";
import {
  deleteOutboxEntryById,
  getDeadLetterOutboxEntries,
  getEligibleOutboxEntries,
  getOutboxCounts,
  updateOutboxEntry,
  type OutboxEntry,
} from "@/lib/db/indexedDb";

export type SendResult =
  | { outcome: "success" }
  | { outcome: "retryable"; message: string; code?: string }
  | { outcome: "permanent"; message: string; code?: string };

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

// Postgres error codes PostgREST/Supabase surface that are deterministic —
// the exact same payload will fail the exact same way every time, so
// retrying is pointless: 23503 foreign_key_violation, 23505
// unique_violation, 23514 check_violation, 42501 insufficient_privilege
// (RLS rejection). PGRST-prefixed codes are PostgREST's own request-shape
// validation errors — also deterministic. Anything else (a 5xx, a timeout
// surfaced as an `error` object rather than a thrown exception, an
// unrecognized code) is treated as transient and retried.
const PERMANENT_ERROR_CODES = new Set(["23503", "23505", "23514", "42501"]);

export function classifySupabaseError(error: { code?: string; message: string }): SendResult {
  if (error.code && (PERMANENT_ERROR_CODES.has(error.code) || error.code.startsWith("PGRST"))) {
    return { outcome: "permanent", message: error.message, code: error.code };
  }
  return { outcome: "retryable", message: error.message, code: error.code };
}

/** Sends one outbox entry to Supabase. A thrown error (network failure,
 * fetch failure, offline) never reached the server, so it's always
 * treated as retryable — `navigator.onLine` is never consulted here or
 * anywhere in this module; only the actual request outcome decides. */
export async function sendOutboxEntry(entry: OutboxEntry): Promise<SendResult> {
  if (!supabase) return { outcome: "retryable", message: "Supabase not configured" };
  try {
    const query = supabase.from(entry.table);
    const { error } =
      entry.op === "upsert"
        ? await query.upsert(entry.payload as Record<string, unknown>)
        : await query.delete().eq("id", (entry.payload as { id: string }).id);
    if (!error) return { outcome: "success" };
    return classifySupabaseError(error);
  } catch (err) {
    return { outcome: "retryable", message: err instanceof Error ? err.message : String(err) };
  }
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Exponential backoff, capped at 5 minutes — `attempts` is the count
 * *after* the failure just recorded, so the first retry waits ~2s, then
 * ~4s, ~8s, ... up to the cap. */
export function backoffDelay(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
}

let draining: Promise<void> | null = null;

/**
 * Processes every outbox entry eligible to send right now (pending, past
 * its backoff) belonging to the CURRENT signed-in user. Entries belonging
 * to a different user (e.g. left over after an account switch on a shared
 * browser) are left completely untouched — not sent, not reassigned, not
 * deleted — until that user is signed in again. Safe to call repeatedly
 * and from multiple triggers (auth/startup, `online`, visibility, a
 * periodic timer): a drain already in progress is reused rather than
 * running a second one concurrently in the same tab.
 */
export function drainOutbox(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    try {
      const userId = await currentUserId();
      if (!userId) return;
      const entries = await getEligibleOutboxEntries();
      for (const entry of entries) {
        if (entry.userId !== userId) continue;
        const result = await sendOutboxEntry(entry);
        if (result.outcome === "success") {
          // The record may have already been deleted server-side by a
          // retry of an earlier attempt whose success acknowledgement was
          // lost (see idempotency note below) — upsert/delete are both
          // safe to repeat, so this is still a clean success either way.
          await deleteOutboxEntryById(entry.id);
        } else if (result.outcome === "permanent") {
          await updateOutboxEntry(entry.id, {
            status: "dead-letter",
            attempts: entry.attempts + 1,
            lastError: result.message,
            lastErrorCode: result.code,
          });
        } else {
          const attempts = entry.attempts + 1;
          await updateOutboxEntry(entry.id, {
            attempts,
            nextAttemptAt: Date.now() + backoffDelay(attempts),
            lastError: result.message,
            lastErrorCode: result.code,
          });
        }
      }
    } finally {
      draining = null;
    }
  })();
  return draining;
}

export async function getOutboxSyncState(): Promise<{ pending: number; deadLetter: number }> {
  const userId = await currentUserId();
  if (!userId) return { pending: 0, deadLetter: 0 };
  return getOutboxCounts(userId);
}

/** The dead-letter entries for the signed-in user — the detail behind the
 * plain count in `getOutboxSyncState`, for SyncStatusBanner to explain what
 * actually failed. */
export async function getDeadLetterEntries(): Promise<OutboxEntry[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  return getDeadLetterOutboxEntries(userId);
}

/** Puts one dead-lettered entry back in the retry queue and immediately
 * attempts to drain it. The local record was never at risk — this only
 * retries getting its cloud copy to land, e.g. after the user fixed
 * whatever made the server reject it (or the server-side issue itself
 * cleared up). */
export async function retryOutboxEntry(id: string): Promise<void> {
  await updateOutboxEntry(id, { status: "pending", nextAttemptAt: Date.now() });
  await drainOutbox();
}
