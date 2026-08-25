import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  withDataLock,
  putItemInternal,
  enqueueOutboxInternal,
  updateOutboxEntry,
  deleteOutboxEntryById,
  getAllOutboxEntries,
  getDeadLetterOutboxEntries,
  getAllItems,
  getAllCategories,
  clearAllDataInternal,
} from "@/lib/db/indexedDb";
import type { RawItem } from "@/lib/types";

// This file deliberately does NOT mock @/lib/db/indexedDb — unlike
// sync.test.ts, which mocks the put*Internal functions to observe call
// ordering/concurrency. These tests need real local reads/writes (the
// repair pass reads real dead-letter entries and real local items), backed
// by the same fake-indexeddb every other *.test.ts in this app already
// uses transparently (see vitest.config.mts).

function makeFakeSupabase(tables: Record<string, unknown[]>) {
  return {
    auth: {
      getSession: async (): Promise<{ data: { session: { user: { id: string } } | null } }> => ({ data: { session: { user: { id: "user-1" } } } }),
    },
    from(table: string) {
      const rows = tables[table] ?? [];
      return {
        select() {
          // .eq() chaining to match fetchAllRows' real query shape (see the
          // identical comment in sync.test.ts's own fake) — a no-op filter
          // here since none of this file's fixtures set `user_id`.
          const builder = {
            eq() {
              return builder;
            },
            range(from: number, to: number) {
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

let currentFakeSupabase: ReturnType<typeof makeFakeSupabase> | null = null;
function configureFakeSupabase(tables: Record<string, unknown[]>) {
  currentFakeSupabase = makeFakeSupabase(tables);
}

vi.mock("./client", () => ({
  get supabase() {
    return currentFakeSupabase;
  },
  supabaseConfigured: true,
}));

beforeEach(async () => {
  configureFakeSupabase({});
  // initialPullState is module-level (see sync.ts) and persists across
  // tests in this file otherwise — reset it so each test's own
  // waitForInitialPull calls genuinely wait rather than seeing a previous
  // test's already-resolved gate for the same userId.
  const { resetInitialPullState } = await import("./sync");
  resetInitialPullState();
  // Every test in this file shares the same fake "user-1" session (the
  // fake Supabase auth mock is hardcoded — pullFromCloud/ensureCategoryId
  // all read the session, not a per-test override), and this file
  // deliberately doesn't mock indexedDb.ts, so the underlying
  // fake-indexeddb instance (and everything in it — items, categories,
  // the outbox) otherwise persists across every test in this describe
  // block. Clear all of it, including outbox entries (clearAllDataInternal
  // deliberately never touches those — see its own doc comment — so
  // they're wiped separately here), for a genuinely clean slate each time.
  await withDataLock(() => clearAllDataInternal());
  for (const entry of await getAllOutboxEntries()) {
    await deleteOutboxEntryById(entry.id);
  }
});

afterEach(() => {
  currentFakeSupabase = null;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Enqueues a real outbox entry, then immediately marks it dead-letter with
 * the given code — the same end state drainOutbox itself would leave
 * behind after a permanent rejection, without needing a real failing send.
 *
 * Ends with a short real delay past this entry's own `createdAt` — every
 * test in this file goes on to call `pullFromCloud()` right after seeding,
 * which captures its own race-detection cutoff (`pullStartedAt`,
 * `Date.now()`-based — see hasOutboxEntriesSinceInternal in indexedDb.ts)
 * as its very first step. `Date.now()`'s millisecond resolution means a
 * fast in-memory test can easily land the seed and that cutoff in the same
 * millisecond, making `createdAt >= pullStartedAt` spuriously true —
 * pullFromCloud would then (correctly, by its own logic) treat this
 * already-dead-lettered entry as a local write that raced in after its
 * snapshot, and discard/retry the attempt instead of installing it. Without
 * this delay that's flaky: usually the attempt eventually clears the
 * millisecond boundary within MAX_PULL_ATTEMPTS retries, but not always. */
async function seedDeadLetter(entry: Parameters<typeof enqueueOutboxInternal>[0], code: string) {
  await withDataLock(() => enqueueOutboxInternal(entry));
  const [row] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === entry.dedupeKey);
  // updateOutboxEntry is already withDataLock-wrapped internally — calling
  // it from inside another withDataLock call here would deadlock (the
  // outer call can never finish waiting on the inner one, which can never
  // start because the queue already advanced past it).
  await updateOutboxEntry(row.id, { status: "dead-letter", attempts: 1, lastErrorCode: code, lastError: "simulated" });
  await sleep(2);
  return row.id;
}

function makeItem(overrides: Partial<RawItem> = {}): RawItem {
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

describe("pullFromCloud's dead-letter repair pass", () => {
  it("auto-discards a dead-lettered category upsert that's a duplicate (23505) once a pull confirms the real one already exists", async () => {
    // The real "Food" habit category already exists server-side...
    configureFakeSupabase({
      categories: [{ id: "real-category-1", item_type: "habit", name: "Food" }],
    });
    // ...but this device also has a stuck dead-letter entry for a SECOND,
    // phantom "Food" category it tried to create under a different id (the
    // exact failure the pre-pull seeding race produces).
    await seedDeadLetter(
      { userId: "user-1", table: "categories", op: "upsert", payload: { id: "phantom-category-1", user_id: "user-1", item_type: "habit", name: "Food" }, dedupeKey: "categories:phantom-category-1" },
      "23505",
    );

    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    const stillDeadLettered = await getDeadLetterOutboxEntries("user-1");
    expect(stillDeadLettered.find((e) => e.dedupeKey === "categories:phantom-category-1")).toBeUndefined();
    // The real category is what's actually installed — nothing was lost.
    const categories = await getAllCategories();
    expect(categories.map((c) => c.id)).toEqual(["real-category-1"]);
  });

  it("repairs a dead-lettered item (23503, missing category) that still exists locally, by re-resolving its category from the fresh pull", async () => {
    configureFakeSupabase({
      categories: [{ id: "real-category-1", item_type: "habit", name: "Food" }],
    });
    // The item is still sitting locally, pointed at a category id that was
    // never actually created server-side (the phantom from the seeding
    // race) — category display name "Food" is still correct, only the id
    // is stale.
    await withDataLock(() => putItemInternal(makeItem({ identity: "item-1", category: "Food", categoryId: "phantom-category-1" })));
    await seedDeadLetter(
      { userId: "user-1", table: "habit_items", op: "upsert", payload: { id: "item-1", user_id: "user-1", name: "Fast 12+ hours", category_id: "phantom-category-1", item_type: "habit" }, dedupeKey: "habit_items:item-1" },
      "23503",
    );

    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    // The stale dead-letter entry for the item is gone...
    const stillDeadLettered = await getDeadLetterOutboxEntries("user-1");
    expect(stillDeadLettered.find((e) => e.dedupeKey === "habit_items:item-1")).toBeUndefined();
    // ...the item survived (not lost) and now points at the REAL category...
    const items = await getAllItems();
    const repaired = items.find((i) => i.identity === "item-1");
    expect(repaired?.categoryId).toBe("real-category-1");
    // ...and a fresh, correct outbox entry exists to actually sync that fix.
    const pending = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "habit_items:item-1" && e.status === "pending");
    expect(pending).toHaveLength(1);
    expect((pending[0].payload as { category_id: string }).category_id).toBe("real-category-1");
  });

  it("leaves a dead-lettered item's entry alone when the item no longer exists locally — nothing to safely repair from", async () => {
    configureFakeSupabase({
      categories: [{ id: "real-category-1", item_type: "habit", name: "Food" }],
    });
    // No putItemInternal call — the item was already evicted by an earlier
    // pull (it never made it to Supabase either), only its outbox ghost
    // remains.
    await seedDeadLetter(
      { userId: "user-1", table: "habit_items", op: "upsert", payload: { id: "item-1", user_id: "user-1", name: "Fast 12+ hours", category_id: "phantom-category-1", item_type: "habit" }, dedupeKey: "habit_items:item-1" },
      "23503",
    );

    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    // Not silently discarded or resurrected — left for the user to see and
    // decide (Discard, or re-create it if they still want it tracked).
    const stillDeadLettered = await getDeadLetterOutboxEntries("user-1");
    expect(stillDeadLettered.find((e) => e.dedupeKey === "habit_items:item-1")).toBeDefined();
  });

  it("does not touch a dead-lettered entry belonging to a different user", async () => {
    configureFakeSupabase({
      categories: [{ id: "real-category-1", item_type: "habit", name: "Food" }],
    });
    await seedDeadLetter(
      { userId: "someone-else", table: "categories", op: "upsert", payload: { id: "phantom-category-1", user_id: "someone-else", item_type: "habit", name: "Food" }, dedupeKey: "categories:phantom-category-1" },
      "23505",
    );

    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    const otherUsersDeadLetters = await getDeadLetterOutboxEntries("someone-else");
    expect(otherUsersDeadLetters).toHaveLength(1);
  });

  it("repeated pulls are idempotent — running pullFromCloud again doesn't recreate a discarded duplicate or grow the dead-letter count", async () => {
    configureFakeSupabase({
      categories: [{ id: "real-category-1", item_type: "habit", name: "Food" }],
    });
    await seedDeadLetter(
      { userId: "user-1", table: "categories", op: "upsert", payload: { id: "phantom-category-1", user_id: "user-1", item_type: "habit", name: "Food" }, dedupeKey: "categories:phantom-category-1" },
      "23505",
    );

    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();
    const afterFirst = await getDeadLetterOutboxEntries("user-1");
    await pullFromCloud();
    await pullFromCloud();
    const afterThird = await getDeadLetterOutboxEntries("user-1");

    expect(afterFirst).toHaveLength(0);
    expect(afterThird).toHaveLength(0);
    const categories = await getAllCategories();
    expect(categories).toHaveLength(1); // never re-duplicated
  });
});

describe("waitForInitialPull — the actual gate that stops new occurrences", () => {
  it("resolves immediately with no session (nothing to wait for)", async () => {
    configureFakeSupabase({});
    currentFakeSupabase!.auth.getSession = async () => ({ data: { session: null } });
    const { waitForInitialPull } = await import("./sync");
    await expect(waitForInitialPull()).resolves.toBeUndefined();
  });

  it("blocks ensureCategoryId's seeding decision until the initial pull installs the user's real existing category", async () => {
    // The account already has a real "Food" habit category — the exact
    // scenario that broke: a cold start where ensureCategoryId runs before
    // the pull has had a chance to show that.
    configureFakeSupabase({
      categories: [{ id: "real-category-1", item_type: "habit", name: "Food" }],
    });
    const { pullFromCloud, waitForInitialPull } = await import("./sync");
    const { ensureCategoryId } = await import("@/lib/categoryResolution");

    // Race ensureCategoryId's very first call (nothing pulled yet) against
    // a pull for the same session.
    const pullPromise = pullFromCloud();
    const idPromise = ensureCategoryId("habit", "Food");
    await Promise.all([pullPromise, idPromise]);

    const resolvedId = await idPromise;
    expect(resolvedId).toBe("real-category-1"); // resolved to the REAL category, not a fresh duplicate
    const categories = await getAllCategories();
    expect(categories).toHaveLength(1); // no duplicate ever got created
    await waitForInitialPull(); // should already be resolved — no hang
  });
});
