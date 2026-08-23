import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  withDataLock,
  enqueueOutboxInternal,
  getAllOutboxEntries,
  deleteOutboxEntryById,
  clearAllData,
  clearAllDataInternal,
  getAllItems,
  putItemInternal,
  updateOutboxEntry,
} from "@/lib/db/indexedDb";
import type { RawItem } from "@/lib/types";

// Deliberately does NOT mock @/lib/db/indexedDb — see repair.test.ts's own
// comment on why (needs real local reads/writes, backed by the same
// fake-indexeddb every *.test.ts in this app already uses transparently).

/** A minimal in-memory "server": upsert/delete actually mutate a table, and
 * the session user can be swapped mid-test (simulating sign-out/sign-in as
 * the same or a different user), unlike repair.test.ts's read-only fake
 * supabase (that one never needs a mutation to actually land). */
function makeFakeSupabase() {
  const tables: Record<string, Map<string, Record<string, unknown>>> = {};
  let currentUserId: string | null = "user-a";
  return {
    auth: {
      getSession: async () => ({ data: { session: currentUserId ? { user: { id: currentUserId } } : null } }),
    },
    setCurrentUser(userId: string | null) {
      currentUserId = userId;
    },
    getTable(table: string) {
      return [...(tables[table]?.values() ?? [])];
    },
    from(table: string) {
      tables[table] ??= new Map();
      const store = tables[table];
      return {
        select() {
          return {
            range(from: number, to: number) {
              const rows = [...store.values()];
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            },
          };
        },
        upsert(payload: Record<string, unknown>) {
          store.set(payload.id as string, payload);
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(_col: string, id: string) {
              store.delete(id);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

let currentFakeSupabase: ReturnType<typeof makeFakeSupabase> | null = null;

vi.mock("./client", () => ({
  get supabase() {
    return currentFakeSupabase;
  },
  supabaseConfigured: true,
}));

beforeEach(async () => {
  currentFakeSupabase = makeFakeSupabase();
  const { resetInitialPullState } = await import("./sync");
  resetInitialPullState();
  await withDataLock(() => clearAllDataInternal());
  for (const entry of await getAllOutboxEntries()) {
    await deleteOutboxEntryById(entry.id);
  }
});

afterEach(() => {
  currentFakeSupabase = null;
});

// The stronger invariant: a local mutation queued while offline/mid-sync
// must survive the full pending-mutation -> pull -> sign-out -> sign-in
// sequence without ever being lost, attributed to the wrong account, or
// permanently hidden from the user it belongs to.
describe("a pending outbox mutation across pull, sign-out, and sign-in", () => {
  it("survives sign-out untouched, stays invisible to a different user signing in, and resyncs cleanly once its own user signs back in", async () => {
    const { drainOutbox } = await import("./outbox");
    const { pullFromCloud } = await import("./sync");

    // 1. User A queues a local mutation that hasn't synced yet (server is
    // briefly unreachable — simulated by not calling drainOutbox yet).
    await withDataLock(() =>
      enqueueOutboxInternal({
        userId: "user-a",
        table: "habit_items",
        op: "upsert",
        payload: { id: "item-a", user_id: "user-a", name: "Fast 12+ hours", category_id: "cat-a", item_type: "habit" },
        dedupeKey: "habit_items:item-a",
      }),
    );

    // 2. A cloud pull happens (e.g. tab regains focus) before the mutation
    // has drained — pullFromCloud's own best-effort drain sends it, and
    // since the fake server accepts it (upsert never errors here), it
    // should have already synced by the time the pull's fetch runs.
    await pullFromCloud();
    expect(currentFakeSupabase!.getTable("habit_items").map((r) => r.id)).toEqual(["item-a"]);
    expect((await getAllOutboxEntries()).filter((e) => e.dedupeKey === "habit_items:item-a")).toHaveLength(0);

    // 3. A second mutation is queued but this time genuinely doesn't drain
    // before sign-out (simulating "still offline when the user signs out").
    await withDataLock(() =>
      enqueueOutboxInternal({
        userId: "user-a",
        table: "habit_logs",
        op: "upsert",
        payload: { id: "log-a", user_id: "user-a", item_id: "item-a", date: "2026-01-01", value: 1 },
        dedupeKey: "habit_logs:log-a",
      }),
    );

    // 4. Sign-out: DataContext calls clearAllData() — every local record is
    // wiped, but the outbox (a durable queue, not a view of "current
    // account's data") must survive completely untouched.
    await clearAllData();
    const afterSignOut = await getAllOutboxEntries();
    expect(afterSignOut).toHaveLength(1);
    expect(afterSignOut[0]).toMatchObject({ userId: "user-a", dedupeKey: "habit_logs:log-a", status: "pending" });
    expect(await getAllItems()).toHaveLength(0); // local view is genuinely empty now

    // 5. A DIFFERENT user (B) signs into the same browser and drains —
    // user A's still-pending entry must never be sent, reassigned, or
    // deleted on B's behalf.
    currentFakeSupabase!.setCurrentUser("user-b");
    await drainOutbox();
    const afterUserB = await getAllOutboxEntries();
    expect(afterUserB).toHaveLength(1);
    expect(afterUserB[0].userId).toBe("user-a"); // still A's, unmodified
    expect(currentFakeSupabase!.getTable("habit_logs")).toHaveLength(0); // never sent as B

    // 6. User A signs back in — the SAME entry (not a duplicate, not a new
    // one) must resync cleanly and disappear from the outbox once it does,
    // and the record it represents must reappear locally via the pull that
    // follows, not stay hidden forever.
    currentFakeSupabase!.setCurrentUser("user-a");
    await pullFromCloud();
    const afterUserASignsBackIn = await getAllOutboxEntries();
    expect(afterUserASignsBackIn).toHaveLength(0);
    expect(currentFakeSupabase!.getTable("habit_logs").map((r) => r.id)).toEqual(["log-a"]);
  });
});

function makeHabitItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    identity: "item-1",
    itemType: "habit",
    rawName: "Fast 12+ hours",
    category: "Food",
    categoryId: "phantom-category-1",
    isArchived: false,
    createdDate: "2026-01-01",
    reminderTime: null,
    unit: null,
    ...overrides,
  };
}

// Regression for a real reported failure: a user recategorized a stuck
// item through Manage (fixing it), but clicking "Retry" on its dead-letter
// entry kept failing forever — because Retry was resending the FROZEN
// payload captured when the upsert first failed, still pointing at the
// long-gone category, never the item's current, already-fixed state.
describe("retryDeadLetterEntry — Retry reflects the record's CURRENT local state, not a frozen snapshot", () => {
  it("succeeds once the item has been recategorized locally, even though the dead-letter entry's own payload still has the old, gone category", async () => {
    const { retryDeadLetterEntry } = await import("./sync");

    await withDataLock(() =>
      enqueueOutboxInternal({
        userId: "user-a",
        table: "habit_items",
        op: "upsert",
        payload: { id: "item-1", user_id: "user-a", name: "Fast 12+ hours", category_id: "phantom-category-1", item_type: "habit" },
        dedupeKey: "habit_items:item-1",
      }),
    );
    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "habit_items:item-1");
    await updateOutboxEntry(entry.id, { status: "dead-letter", attempts: 1, lastErrorCode: "23503", lastError: "simulated" });

    // The user has since fixed it through Manage: recategorized to a
    // category that's real.
    await withDataLock(() => putItemInternal(makeHabitItem({ category: "Routines", categoryId: "real-routines-category" })));

    // Clicking Retry must succeed now, sending the item's CURRENT category
    // — not the stale one still frozen in the entry's own payload.
    await retryDeadLetterEntry(entry.id);

    expect(await getAllOutboxEntries()).toHaveLength(0); // no longer stuck
    const serverRow = currentFakeSupabase!.getTable("habit_items").find((r) => r.id === "item-1");
    expect(serverRow?.category_id).toBe("real-routines-category");
  });

  it("falls back to resending the existing payload unchanged when the item no longer exists locally", async () => {
    const { retryDeadLetterEntry } = await import("./sync");
    await withDataLock(() =>
      enqueueOutboxInternal({
        userId: "user-a",
        table: "habit_items",
        op: "upsert",
        payload: { id: "item-missing", user_id: "user-a", name: "Ghost", category_id: "phantom-category-1", item_type: "habit" },
        dedupeKey: "habit_items:item-missing",
      }),
    );
    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "habit_items:item-missing");
    await updateOutboxEntry(entry.id, { status: "dead-letter", attempts: 1, lastErrorCode: "23503", lastError: "simulated" });

    // No local item for "item-missing" — nothing to refresh from; must not
    // throw, must fall back to the original payload as-is.
    await retryDeadLetterEntry(entry.id);

    const serverRow = currentFakeSupabase!.getTable("habit_items").find((r) => r.id === "item-missing");
    expect(serverRow?.category_id).toBe("phantom-category-1");
  });
});
