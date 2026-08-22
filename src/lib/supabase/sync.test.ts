import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// pullFromCloud now attempts a best-effort outbox drain before its
// destructive clear (see sync.ts and Step 2's design) — stubbed out here
// since these tests are specifically about pullFromCloud's own
// completeness/race behavior, not the outbox. outbox.test.ts covers
// drainOutbox itself.
vi.mock("./outbox", () => ({
  drainOutbox: vi.fn(async () => {}),
}));

// Shared, hoisted so both the vi.mock factories and the tests below can see
// the same instances. Each mocked *Internal writer:
//  - records into `calls` synchronously, so ordering is exact and doesn't
//    depend on timing;
//  - tracks how many calls of its own kind are simultaneously in flight
//    (`concurrency[label].max`) — this is the real regression guard. A
//    `for`-loop with a proper `await` can never have more than one call of
//    the same kind in flight at once; the original bug (`ITEM_TYPES.forEach`
//    + `void putItemInternal(...)`) fires every call in the same synchronous
//    tick without waiting, so several of them are simultaneously "in
//    flight" — max concurrency > 1 is a direct, timing-independent signal
//    of a missing await, immune to being masked by unrelated slower work
//    elsewhere in the same function;
//  - only pushes into `committed` after an artificial delay, so a whole-
//    function completeness check (see below) still has something to assert
//    on too.
const {
  calls,
  committed,
  concurrency,
  mockClearAllDataInternal,
  mockPutItemInternal,
  mockPutLogInternal,
  mockPutDiaryEntryInternal,
  mockPutCategoryInternal,
  mockPutStoolLogInternal,
  mockPutGymLogInternal,
} = vi.hoisted(() => {
  const calls: string[] = [];
  const committed: string[] = [];
  const concurrency: Record<string, { current: number; max: number }> = {};
  function delayedRecorder(label: string, idOf: (arg: never) => string) {
    concurrency[label] = { current: 0, max: 0 };
    return vi.fn(async (arg: never) => {
      calls.push(label);
      const c = concurrency[label];
      c.current++;
      c.max = Math.max(c.max, c.current);
      await new Promise((r) => setTimeout(r, 5));
      c.current--;
      committed.push(`${label}:${idOf(arg)}`);
    });
  }
  return {
    calls,
    committed,
    concurrency,
    mockClearAllDataInternal: vi.fn(async () => {
      calls.push("clear");
    }),
    mockPutItemInternal: delayedRecorder("item", (i: { identity: string }) => i.identity),
    mockPutLogInternal: delayedRecorder("log", (l: { identity: string }) => l.identity),
    mockPutDiaryEntryInternal: delayedRecorder("diary", (d: { identity: string }) => d.identity),
    mockPutCategoryInternal: delayedRecorder("category", (c: { id: string }) => c.id),
    mockPutStoolLogInternal: delayedRecorder("stool", (s: { id: string }) => s.id),
    mockPutGymLogInternal: delayedRecorder("gym", (g: { id: string }) => g.id),
  };
});

vi.mock("@/lib/db/indexedDb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/indexedDb")>();
  return {
    ...actual,
    // withDataLock is left as the real implementation — these tests rely
    // on its genuine mutual-exclusion behavior, not a fake.
    clearAllDataInternal: mockClearAllDataInternal,
    putItemInternal: mockPutItemInternal,
    putLogInternal: mockPutLogInternal,
    putDiaryEntryInternal: mockPutDiaryEntryInternal,
    putCategoryInternal: mockPutCategoryInternal,
    putStoolLogInternal: mockPutStoolLogInternal,
    putGymLogInternal: mockPutGymLogInternal,
    // Records into the SAME `calls` timeline as the put mocks above
    // (synchronously, before delegating to the real enqueue), so a
    // *AndSync function's mutation and its outbox enqueue can be checked
    // for adjacency — proving nothing (e.g. a pull) could land between
    // them — not just that both eventually happened somewhere.
    enqueueOutboxInternal: vi.fn(async (entry: Parameters<typeof actual.enqueueOutboxInternal>[0]) => {
      calls.push(`enqueue:${entry.dedupeKey}`);
      return actual.enqueueOutboxInternal(entry);
    }),
  };
});

function makeFakeSupabase(tables: Record<string, unknown[]>) {
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
    },
    from(table: string) {
      const rows = tables[table] ?? [];
      return {
        select() {
          return {
            range(from: number, to: number) {
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            },
          };
        },
      };
    },
  };
}

vi.mock("./client", () => ({
  get supabase() {
    return currentFakeSupabase;
  },
  supabaseConfigured: true,
}));

// Set per-test via configureFakeSupabase(); read lazily by the mocked
// getter above so each test can swap in its own fixture.
let currentFakeSupabase: ReturnType<typeof makeFakeSupabase> | null = null;
function configureFakeSupabase(tables: Record<string, unknown[]>) {
  currentFakeSupabase = makeFakeSupabase(tables);
}

const baseTables = {
  categories: [{ id: "cat-food-1", item_type: "food", name: "Fruit" }],
  food_items: [
    { id: "item-food-1", name: "Apple", category_id: "cat-food-1", is_archived: false, created_date: "2026-01-01" },
    { id: "item-food-2", name: "Banana", category_id: "cat-food-1", is_archived: false, created_date: "2026-01-01" },
  ],
  supplement_items: [
    { id: "item-supp-1", name: "Vitamin D", category_id: null, is_archived: false, created_date: "2026-01-01" },
  ],
  food_logs: [
    { id: "log-food-1", item_id: "item-food-1", date: "2026-01-01", value: 1, updated_at: "2026-01-01T08:00:00.000Z", meal_tag: "Breakfast" },
    { id: "log-food-2", item_id: "item-food-2", date: "2026-01-01", value: 1, updated_at: "2026-01-01T08:05:00.000Z", meal_tag: "Breakfast" },
  ],
  supplement_logs: [
    { id: "log-supp-1", item_id: "item-supp-1", date: "2026-01-01", value: 1, updated_at: "2026-01-01T08:10:00.000Z" },
  ],
  food_diary: [{ id: "diary-food-1", item_id: "item-food-1", date: "2026-01-01", content: "note", title: null, updated_at: "2026-01-01T08:00:00.000Z" }],
  stool_logs: [
    {
      id: "stool-1",
      date: "2026-01-01",
      logged_at: "2026-01-01T09:00:00.000Z",
      bristol_scores: [4],
      no_bristol: false,
      color: "Brown",
      floatation: null,
      is_sticky: false,
      is_smelly: false,
      is_straining: false,
      has_mucus: false,
      has_urgency: false,
      has_visible_food_particles: false,
      has_incomplete_evacuation: false,
      paper_cleanliness: "Clean",
      time_on_toilet_minutes: 5,
      note: null,
      updated_at: "2026-01-01T09:00:00.000Z",
    },
  ],
  gym_logs: [{ id: "gym-1", date: "2026-01-01", exercise: "Squat", weight_kg: 60, updated_at: "2026-01-01T10:00:00.000Z" }],
};

beforeEach(() => {
  calls.length = 0;
  committed.length = 0;
  for (const key of Object.keys(concurrency)) {
    concurrency[key].current = 0;
    concurrency[key].max = 0;
  }
  mockClearAllDataInternal.mockClear();
  mockPutItemInternal.mockClear();
  mockPutLogInternal.mockClear();
  mockPutDiaryEntryInternal.mockClear();
  mockPutCategoryInternal.mockClear();
  mockPutStoolLogInternal.mockClear();
  mockPutGymLogInternal.mockClear();
  configureFakeSupabase(baseTables);
});

afterEach(() => {
  currentFakeSupabase = null;
});

describe("pullFromCloud", () => {
  it("has fully populated IndexedDB by the time it resolves — every row from every table, not just started", async () => {
    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    // If pullFromCloud regressed to `void putXInternal(...)` instead of
    // awaiting, this would fail: `committed` only gains an entry after the
    // mock's artificial 5ms delay, so an un-awaited call wouldn't have
    // landed yet at this exact point.
    expect(committed).toEqual(
      expect.arrayContaining([
        "category:cat-food-1",
        "item:item-food-1",
        "item:item-food-2",
        "item:item-supp-1",
        "log:log-food-1",
        "log:log-food-2",
        "log:log-supp-1",
        "diary:diary-food-1",
        "stool:stool-1",
        "gym:gym-1",
      ]),
    );
    expect(committed.length).toBe(10);
  });

  it("never has more than one write of the same kind in flight at once — each row is awaited before the next one starts", async () => {
    // This is the direct regression guard for the original bug: a
    // `ITEM_TYPES.forEach(...)` loop calling `void putItemInternal(item)`
    // fires every call in the same synchronous tick, so several would be
    // "in flight" (past the mock's synchronous prelude, not yet past its
    // artificial delay) at once. A proper `for` loop with `await` can only
    // ever have one in flight per kind, regardless of how long anything
    // else in the function takes — unlike a wall-clock check, this can't
    // be masked by slower, correctly-awaited work elsewhere in the pull.
    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    expect(concurrency.item.max).toBe(1);
    expect(concurrency.log.max).toBe(1);
    expect(concurrency.diary.max).toBe(1);
    expect(concurrency.category.max).toBe(1);
    expect(concurrency.stool.max).toBe(1);
    expect(concurrency.gym.max).toBe(1);
  });

  it("clears before writing anything, and every write happens after the clear", async () => {
    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    expect(calls[0]).toBe("clear");
    expect(calls.filter((c) => c !== "clear").length).toBe(10); // 1 category + 3 items + 3 logs + 1 diary + 1 stool + 1 gym
  });

  it("writes every item across more than one item type, not just the first type in the loop", async () => {
    const { pullFromCloud } = await import("./sync");
    await pullFromCloud();

    expect(mockPutItemInternal).toHaveBeenCalledTimes(3);
    const ids = mockPutItemInternal.mock.calls.map(([item]) => (item as { identity: string }).identity);
    expect(ids).toEqual(expect.arrayContaining(["item-food-1", "item-food-2", "item-supp-1"]));
  });

  it("a local write submitted while a pull is in flight cannot land in the clear-to-repopulate gap", async () => {
    const { pullFromCloud } = await import("./sync");
    const { withDataLock } = await import("@/lib/db/indexedDb");

    const pullPromise = pullFromCloud();
    await sleep(1); // let the pull acquire the lock and call clearAllDataInternal first
    const writePromise = withDataLock(async () => {
      // Pushed into the SAME shared `calls` timeline the pull's own writes
      // use, so position (not just eventual presence) is verifiable —
      // asserting only that this array contains "local-write" would pass
      // even if the write ran concurrently with the pull.
      calls.push("local-write");
    });

    await Promise.all([pullPromise, writePromise]);

    // The local write must be the very last thing recorded — after the
    // clear and all 10 puts — proving it couldn't have landed in (or been
    // wiped by) any part of the pull's clear-and-repopulate sequence.
    expect(calls.at(-1)).toBe("local-write");
    expect(calls.filter((c) => c === "local-write")).toHaveLength(1);
    expect(calls.length).toBe(12); // clear + 10 puts + the local write
  });

  it("a local write already in flight completes before a concurrently-triggered pull can start clearing", async () => {
    const { withDataLock } = await import("@/lib/db/indexedDb");

    const writePromise = withDataLock(async () => {
      calls.push("write:start");
      await sleep(10);
      calls.push("write:end");
    });
    await sleep(1); // let the write acquire the lock first

    const { pullFromCloud } = await import("./sync");
    const pullPromise = pullFromCloud();

    await Promise.all([writePromise, pullPromise]);

    // The clear must not appear until after the write's own lock hold
    // (start *and* end) has released — proving the pull couldn't begin
    // clearing while that write was still in progress.
    expect(calls.slice(0, 3)).toEqual(["write:start", "write:end", "clear"]);
  });
});

describe("putItemAndSync — mutation and outbox enqueue are one atomic operation", () => {
  it("enqueues a real outbox entry for the write", async () => {
    const { putItemAndSync } = await import("./sync");
    const { getAllOutboxEntries } = await import("@/lib/db/indexedDb");

    const item = { identity: "atomic-item-1", itemType: "food" as const, rawName: "Pear", category: "Fruit", categoryId: null, isArchived: false, createdDate: "2026-01-01", reminderTime: null, unit: null };
    await putItemAndSync(item);

    const entries = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "food_items:atomic-item-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ table: "food_items", op: "upsert", status: "pending" });
  });

  // food_items/symptom_items/workout_items have no reminder_time column
  // (see schema.sql) — sending that key would make Supabase reject the
  // whole upsert as an unknown column, not just ignore it.
  it("never sends reminder_time for a type whose table doesn't have that column", async () => {
    const { putItemAndSync } = await import("./sync");
    const { getAllOutboxEntries } = await import("@/lib/db/indexedDb");

    const item = { identity: "no-reminder-item-1", itemType: "food" as const, rawName: "Kiwi", category: "Fruit", categoryId: null, isArchived: false, createdDate: "2026-01-01", reminderTime: null, unit: null };
    await putItemAndSync(item);

    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "food_items:no-reminder-item-1");
    expect(entry.payload).not.toHaveProperty("reminder_time");
  });

  it("sends reminder_time for a type whose table has it (supplement/habit)", async () => {
    const { putItemAndSync } = await import("./sync");
    const { getAllOutboxEntries } = await import("@/lib/db/indexedDb");

    const item = {
      identity: "with-reminder-item-1",
      itemType: "supplement" as const,
      rawName: "Iron",
      category: "Minerals",
      categoryId: null,
      isArchived: false,
      createdDate: "2026-01-01",
      reminderTime: "08:00",
      unit: null,
    };
    await putItemAndSync(item);

    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "supplement_items:with-reminder-item-1");
    expect(entry.payload).toMatchObject({ reminder_time: "08:00" });
  });

  it("its mutation and its outbox enqueue are adjacent in the timeline — nothing, including a pull, can land between them", async () => {
    const { putItemAndSync, pullFromCloud } = await import("./sync");

    // Fire a SECOND pull once putItemAndSync's own write has landed but
    // (in a buggy, non-atomic implementation) before its enqueue would
    // have happened — if the mutation and the enqueue were two separate
    // lock acquisitions instead of one, this pull could slip into that
    // gap. With a real single-lock implementation there is no gap to
    // land in, so this second pull can only ever end up fully before or
    // fully after the whole putItemAndSync call.
    const item = { identity: "atomic-item-2", itemType: "food" as const, rawName: "Plum", category: "Fruit", categoryId: null, isArchived: false, createdDate: "2026-01-01", reminderTime: null, unit: null };
    const writePromise = putItemAndSync(item);
    await sleep(1);
    const pullPromise = pullFromCloud();

    await Promise.all([writePromise, pullPromise]);

    const itemIndex = calls.indexOf("item");
    const enqueueIndex = calls.indexOf("enqueue:food_items:atomic-item-2");
    expect(itemIndex).toBeGreaterThanOrEqual(0);
    expect(enqueueIndex).toBe(itemIndex + 1);
  });
});

describe("deleteItemAndSync", () => {
  // putItemInternal/deleteItemLocalInternal aren't mocked in this file the
  // way putItemInternal is (see the vi.mock("@/lib/db/indexedDb", ...)
  // above) — deleteItemLocalInternal runs for real, so this only asserts
  // the outbox side; indexedDb.test.ts covers the actual local delete.
  it("enqueues a delete outbox entry for the item's table", async () => {
    const { deleteItemAndSync } = await import("./sync");
    const { getAllOutboxEntries } = await import("@/lib/db/indexedDb");

    await deleteItemAndSync("habit-delete-1", "habit");

    const entries = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "habit_items:habit-delete-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ table: "habit_items", op: "delete", payload: { id: "habit-delete-1" }, status: "pending" });
  });
});

describe("setItemReminderTimeAndSync — reminder reset can't be coalesced away by an unrelated edit", () => {
  it("uses a dedupeKey distinct from the item's own, so a following rename can't erase the pending reminder_last_sent_date reset", async () => {
    const { putItemAndSync, setItemReminderTimeAndSync } = await import("./sync");
    const { getAllOutboxEntries } = await import("@/lib/db/indexedDb");

    const item = {
      identity: "reminder-item-1",
      itemType: "supplement" as const,
      rawName: "Magnesium",
      category: "Minerals",
      categoryId: null,
      isArchived: false,
      createdDate: "2026-01-01",
      reminderTime: null,
      unit: null,
    };

    // Changing the reminder time first (queues the reset), then an
    // unrelated edit to the same item before either would have drained —
    // exactly the sequence that, with a shared dedupeKey, would coalesce
    // the second payload over the first and silently drop the reset.
    await setItemReminderTimeAndSync(item, "09:00");
    await putItemAndSync({ ...item, reminderTime: "09:00", rawName: "Magnesium Glycinate" });

    const entries = await getAllOutboxEntries();
    const reminderEntry = entries.find((e) => e.dedupeKey === "supplement_items:reminder-item-1:reminder");
    const itemEntry = entries.find((e) => e.dedupeKey === "supplement_items:reminder-item-1");

    // Both entries survived as separate rows — if they'd shared a
    // dedupeKey, the second enqueue would have coalesced into (replaced)
    // the first, and reminderEntry would either be undefined or would no
    // longer carry the reset.
    expect(reminderEntry).toBeDefined();
    expect(itemEntry).toBeDefined();
    expect(reminderEntry?.payload).toMatchObject({ reminder_last_sent_date: null, name: "Magnesium" });
    expect(itemEntry?.payload).not.toHaveProperty("reminder_last_sent_date");
    expect(itemEntry?.payload).toMatchObject({ name: "Magnesium Glycinate" });
  });

  it("two reminder-time changes in a row still coalesce to just the latest", async () => {
    const { setItemReminderTimeAndSync } = await import("./sync");
    const { getAllOutboxEntries } = await import("@/lib/db/indexedDb");

    const item = {
      identity: "reminder-item-2",
      itemType: "habit" as const,
      rawName: "Stretching",
      category: "Movement",
      categoryId: null,
      isArchived: false,
      createdDate: "2026-01-01",
      reminderTime: null,
      unit: null,
    };

    await setItemReminderTimeAndSync(item, "07:00");
    await setItemReminderTimeAndSync(item, "07:30");

    const entries = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === "habit_items:reminder-item-2:reminder");
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toMatchObject({ reminder_time: "07:30", reminder_last_sent_date: null });
  });
});
