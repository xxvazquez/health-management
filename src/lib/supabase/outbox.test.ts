import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueOutbox, getAllOutboxEntries, updateOutboxEntry } from "@/lib/db/indexedDb";

let counter = 0;
function unique(label: string): { userId: string; dedupeKey: string } {
  counter += 1;
  return { userId: `user-${label}-${counter}`, dedupeKey: `food_items:item-${label}-${counter}` };
}

// Controllable per-test fake — `upsertResult`/`deleteResult` are read fresh
// on every call, and `thrown` (if set) makes the call throw instead of
// resolving, simulating a network/fetch failure that never reached the
// server.
let upsertResult: { error: { code?: string; message: string } | null } = { error: null };
let deleteResult: { error: { code?: string; message: string } | null } = { error: null };
let thrown: Error | null = null;
let currentSessionUserId: string | null = "user-1";
const sentCalls: { table: string; op: string }[] = [];

vi.mock("./client", () => ({
  get supabase() {
    return {
      auth: {
        getSession: async () => ({ data: { session: currentSessionUserId ? { user: { id: currentSessionUserId } } : null } }),
      },
      from(table: string) {
        return {
          upsert: async () => {
            sentCalls.push({ table, op: "upsert" });
            if (thrown) throw thrown;
            return upsertResult;
          },
          delete: () => ({
            eq: async () => {
              sentCalls.push({ table, op: "delete" });
              if (thrown) throw thrown;
              return deleteResult;
            },
          }),
        };
      },
    };
  },
  supabaseConfigured: true,
}));

beforeEach(() => {
  upsertResult = { error: null };
  deleteResult = { error: null };
  thrown = null;
  currentSessionUserId = "user-1";
  sentCalls.length = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("classifySupabaseError", () => {
  it("classifies FK, unique, check-constraint, and RLS violations as permanent", async () => {
    const { classifySupabaseError } = await import("./outbox");
    for (const code of ["23503", "23505", "23514", "42501"]) {
      expect(classifySupabaseError({ code, message: "x" })).toMatchObject({ outcome: "permanent", code });
    }
  });

  it("classifies PostgREST-prefixed codes as permanent", async () => {
    const { classifySupabaseError } = await import("./outbox");
    expect(classifySupabaseError({ code: "PGRST116", message: "x" })).toMatchObject({ outcome: "permanent" });
  });

  it("classifies an unrecognized or missing code as retryable", async () => {
    const { classifySupabaseError } = await import("./outbox");
    expect(classifySupabaseError({ code: "53300", message: "too many connections" })).toMatchObject({ outcome: "retryable" });
    expect(classifySupabaseError({ message: "no code at all" })).toMatchObject({ outcome: "retryable" });
  });
});

describe("backoffDelay", () => {
  it("grows exponentially and caps at 5 minutes", async () => {
    const { backoffDelay } = await import("./outbox");
    expect(backoffDelay(0)).toBe(2_000);
    expect(backoffDelay(1)).toBe(4_000);
    expect(backoffDelay(2)).toBe(8_000);
    expect(backoffDelay(20)).toBe(5 * 60_000);
  });
});

describe("sendOutboxEntry", () => {
  it("returns success when Supabase reports no error", async () => {
    const { sendOutboxEntry } = await import("./outbox");
    const result = await sendOutboxEntry({
      id: "e1",
      userId: "user-1",
      dedupeKey: "food_items:a",
      table: "food_items",
      op: "upsert",
      payload: { id: "a" },
      attempts: 0,
      createdAt: Date.now(),
      nextAttemptAt: Date.now(),
      status: "pending",
    });
    expect(result).toEqual({ outcome: "success" });
  });

  it("returns retryable when the request throws (network/offline failure)", async () => {
    thrown = new Error("Failed to fetch");
    const { sendOutboxEntry } = await import("./outbox");
    const result = await sendOutboxEntry({
      id: "e1",
      userId: "user-1",
      dedupeKey: "food_items:a",
      table: "food_items",
      op: "upsert",
      payload: { id: "a" },
      attempts: 0,
      createdAt: Date.now(),
      nextAttemptAt: Date.now(),
      status: "pending",
    });
    expect(result.outcome).toBe("retryable");
  });

  it("returns permanent when Supabase reports an RLS/FK-style error", async () => {
    upsertResult = { error: { code: "23503", message: "foreign key violation" } };
    const { sendOutboxEntry } = await import("./outbox");
    const result = await sendOutboxEntry({
      id: "e1",
      userId: "user-1",
      dedupeKey: "food_items:a",
      table: "food_items",
      op: "upsert",
      payload: { id: "a" },
      attempts: 0,
      createdAt: Date.now(),
      nextAttemptAt: Date.now(),
      status: "pending",
    });
    expect(result).toMatchObject({ outcome: "permanent", code: "23503" });
  });

  it("sends a delete as .delete().eq(\"id\", ...) against the entry's table", async () => {
    const { sendOutboxEntry } = await import("./outbox");
    await sendOutboxEntry({
      id: "e1",
      userId: "user-1",
      dedupeKey: "stool_logs:s1",
      table: "stool_logs",
      op: "delete",
      payload: { id: "s1" },
      attempts: 0,
      createdAt: Date.now(),
      nextAttemptAt: Date.now(),
      status: "pending",
    });
    expect(sentCalls).toEqual([{ table: "stool_logs", op: "delete" }]);
  });
});

describe("drainOutbox", () => {
  it("removes an entry on successful send", async () => {
    const { userId, dedupeKey } = unique("success");
    currentSessionUserId = userId;
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });

    const { drainOutbox } = await import("./outbox");
    await drainOutbox();

    const remaining = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(remaining).toHaveLength(0);
  });

  it("keeps a transient failure pending, incrementing attempts and pushing nextAttemptAt into the future", async () => {
    const { userId, dedupeKey } = unique("transient");
    currentSessionUserId = userId;
    thrown = new Error("network down");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });

    const { drainOutbox } = await import("./outbox");
    const before = Date.now();
    await drainOutbox();

    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(1);
    expect(entry.nextAttemptAt).toBeGreaterThan(before);
  });

  it("moves a permanent failure to dead-letter and stops retrying it", async () => {
    const { userId, dedupeKey } = unique("permanent");
    currentSessionUserId = userId;
    upsertResult = { error: { code: "42501", message: "new row violates row-level security policy" } };
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });

    const { drainOutbox } = await import("./outbox");
    await drainOutbox();

    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(entry.status).toBe("dead-letter");
    expect(entry.lastErrorCode).toBe("42501");

    // A second drain pass must not attempt it again — dead-letter entries
    // are excluded from getEligibleOutboxEntries.
    sentCalls.length = 0;
    await drainOutbox();
    expect(sentCalls).toHaveLength(0);
  });

  it("retries a transient failure again once its backoff has elapsed, and succeeds", async () => {
    const { userId, dedupeKey } = unique("retry-success");
    currentSessionUserId = userId;
    thrown = new Error("network down");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });

    const { drainOutbox } = await import("./outbox");
    await drainOutbox();
    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(entry.attempts).toBe(1);

    // Simulate the backoff having elapsed and connectivity returning.
    await updateOutboxEntry(entry.id, { nextAttemptAt: Date.now() - 1 });
    thrown = null;
    await drainOutbox();

    const remaining = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(remaining).toHaveLength(0);
  });

  it("never sends an entry belonging to a different user, and never touches it", async () => {
    const owner = unique("owner");
    await enqueueOutbox({ userId: owner.userId, dedupeKey: owner.dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    const [before] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === owner.dedupeKey);

    // A different user is signed in when the drain runs.
    currentSessionUserId = "someone-else";
    const { drainOutbox } = await import("./outbox");
    await drainOutbox();

    expect(sentCalls).toHaveLength(0);
    const [after] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === owner.dedupeKey);
    expect(after).toEqual(before); // untouched: not sent, not reassigned, not deleted
  });

  it("does not run two drains concurrently in the same tab — a second call while one is in flight reuses it", async () => {
    const { userId, dedupeKey } = unique("concurrent");
    currentSessionUserId = userId;
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });

    const { drainOutbox } = await import("./outbox");
    const first = drainOutbox();
    const second = drainOutbox();
    await Promise.all([first, second]);

    // Only ever sent once — a naive implementation without a drain guard
    // would process the same eligible entry twice if two drains overlapped.
    expect(sentCalls.filter((c) => c.table === "food_items")).toHaveLength(1);
  });
});

describe("getOutboxSyncState", () => {
  it("returns zero counts when signed out", async () => {
    currentSessionUserId = null;
    const { getOutboxSyncState } = await import("./outbox");
    expect(await getOutboxSyncState()).toEqual({ pending: 0, deadLetter: 0 });
  });

  it("returns the current user's own pending/dead-letter counts", async () => {
    const { userId, dedupeKey } = unique("state");
    currentSessionUserId = userId;
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: {} });

    const { getOutboxSyncState } = await import("./outbox");
    expect(await getOutboxSyncState()).toEqual({ pending: 1, deadLetter: 0 });
  });
});

describe("getDeadLetterEntries", () => {
  it("returns nothing when signed out", async () => {
    currentSessionUserId = null;
    const { getDeadLetterEntries } = await import("./outbox");
    expect(await getDeadLetterEntries()).toEqual([]);
  });

  it("returns only the current user's dead-letter entries, with the error detail intact", async () => {
    const { userId, dedupeKey } = unique("deadletter");
    currentSessionUserId = userId;
    upsertResult = { error: { code: "23503", message: "foreign key violation" } };
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    const { drainOutbox, getDeadLetterEntries } = await import("./outbox");
    await drainOutbox();

    const entries = await getDeadLetterEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ table: "food_items", lastErrorCode: "23503" });

    // A different signed-in user never sees another user's dead-letter rows.
    currentSessionUserId = "someone-else";
    expect(await getDeadLetterEntries()).toEqual([]);
  });
});

describe("retryOutboxEntry", () => {
  it("puts a dead-letter entry back to pending and resends it immediately", async () => {
    const { userId, dedupeKey } = unique("retry-deadletter");
    currentSessionUserId = userId;
    upsertResult = { error: { code: "23503", message: "foreign key violation" } };
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    const { drainOutbox, getDeadLetterEntries, retryOutboxEntry } = await import("./outbox");
    await drainOutbox();
    const [deadLetter] = await getDeadLetterEntries();
    expect(deadLetter.status).toBe("dead-letter");

    // Whatever made the server reject it is fixed now — the retry should
    // succeed and clear the entry, same as any other successful send.
    upsertResult = { error: null };
    sentCalls.length = 0;
    await retryOutboxEntry(deadLetter.id);

    expect(sentCalls).toEqual([{ table: "food_items", op: "upsert" }]);
    const remaining = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(remaining).toHaveLength(0);
  });
});

