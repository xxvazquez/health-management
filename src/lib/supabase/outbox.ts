import { supabase } from "./client";
import {
  deleteOutboxEntryById,
  getDeadLetterOutboxEntries,
  getEligibleOutboxEntries,
  getOutboxCounts,
  getPendingOutboxEntries,
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
// (RLS rejection). Most PGRST-prefixed codes are PostgREST's own
// request-shape validation errors — also deterministic. The exceptions are
// PGRST000–003 (database unreachable, schema cache reloading, timeout) and
// PGRST301–303 (expired or missing JWT): those clear on their own or after
// a token refresh, so they stay retryable. Any other SQLSTATE in class 22
// (data exception), 23 (integrity violation) or 42 (syntax error / missing
// column or table) is deterministic too — without this a payload the schema
// can't accept would sit in the pending queue retrying forever, never
// telling the user. Anything else (a 5xx, a timeout surfaced as an `error`
// object rather than a thrown exception, an unrecognized code) is treated as
// transient and retried.
const PERMANENT_ERROR_CODES = new Set(["23503", "23505", "23514", "42501"]);
const PERMANENT_SQLSTATE_CLASSES = /^(22|23|42)[0-9A-Z]{3}$/;
const TRANSIENT_POSTGREST_CODES = /^PGRST(00[0-3]|30[1-3])$/;

export function classifySupabaseError(error: { code?: string; message: string }): SendResult {
  const permanent =
    error.code !== undefined &&
    (PERMANENT_ERROR_CODES.has(error.code) ||
      PERMANENT_SQLSTATE_CLASSES.test(error.code) ||
      (error.code.startsWith("PGRST") && !TRANSIENT_POSTGREST_CODES.test(error.code)));
  if (permanent) {
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
    return await withSendTimeout(send(supabase, entry));
  } catch (err) {
    return { outcome: "retryable", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Rejects if `request` hasn't settled within SEND_TIMEOUT_MS. A request that
 * never settles (a stalled connection on a phone, a stuck auth lock) would
 * otherwise hold a drain — or a direct write's caller — open forever. Sends
 * are idempotent, so giving up and retrying later is safe even if the
 * request lands anyway. */
export async function withSendTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Request timed out")), SEND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function send(client: NonNullable<typeof supabase>, entry: OutboxEntry): Promise<SendResult> {
  const query = client.from(entry.table);
  let error;
  if (entry.op === "upsert") {
    ({ error } = await query.upsert(entry.payload as Record<string, unknown>));
  } else if (entry.op === "insert") {
    ({ error } = await query.upsert(entry.payload as Record<string, unknown>, { ignoreDuplicates: true }));
  } else if (entry.op === "update") {
    const { id, ...rest } = entry.payload as Record<string, unknown> & { id: string };
    ({ error } = await query.update(rest).eq("id", id));
  } else {
    const p = entry.payload as { id?: string; match?: Record<string, unknown> };
    ({ error } = p.match ? await query.delete().match(p.match) : await query.delete().eq("id", p.id as string));
  }
  return error ? classifySupabaseError(error) : { outcome: "success" };
}

const SEND_TIMEOUT_MS = 30_000;
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

/** The pending entries for the signed-in user — the detail behind the
 * plain count in `getOutboxSyncState`, for SyncStatusBanner to list what's
 * still queued rather than just how many. */
export async function getPendingEntries(): Promise<OutboxEntry[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  return getPendingOutboxEntries(userId);
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

/**
 * Permanently gives up on ONE dead-lettered sync attempt, without ever
 * sending it. For failures Retry can never fix by itself — most notably a
 * 23505 unique-name conflict, where the queued payload will keep colliding
 * with the exact same already-synced row forever, no matter how many times
 * it's resent unchanged. The local record this entry was trying to push is
 * completely untouched: discarding only cancels the queued CLOUD write,
 * the same "local data was never at risk" guarantee `retryOutboxEntry`
 * documents. The right move after discarding a duplicate-name failure is
 * to go rename (or delete) whichever of the two conflicting records is the
 * one to keep — that produces a fresh, non-conflicting outbox entry that
 * syncs normally, rather than this dead one ever being resent.
 *
 * Scoped to the current user, like every other outbox read/write here, so
 * a stale id left over from a previous account on a shared device can
 * never discard another account's entry.
 */
export async function discardDeadLetterEntry(id: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const entries = await getDeadLetterOutboxEntries(userId);
  if (!entries.some((e) => e.id === id)) return;
  await deleteOutboxEntryById(id);
}
