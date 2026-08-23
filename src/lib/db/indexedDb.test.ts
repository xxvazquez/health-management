import { describe, expect, it } from "vitest";
import {
  withDataLock,
  putItemInternal,
  putLogInternal,
  putDiaryEntryInternal,
  getItem,
  getItemIdentitiesWithHistory,
  deleteItemLocalInternal,
  enqueueOutboxInternal,
  hasOutboxEntriesSinceInternal,
  putWorkoutLogInternal,
  getAllWorkoutLogs,
  renameWorkoutLogsExerciseInternal,
  decrementDailyLogForMealInternal,
} from "./indexedDb";
import type { RawItem, RawLog, RawWorkoutLog } from "@/lib/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withDataLock", () => {
  it("runs a single operation and returns its result", async () => {
    const result = await withDataLock(async () => 42);
    expect(result).toBe(42);
  });

  it("propagates a thrown error to the caller", async () => {
    await expect(
      withDataLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("serializes two operations submitted back-to-back — the second never starts before the first resolves", async () => {
    const order: string[] = [];
    const first = withDataLock(async () => {
      order.push("first:start");
      await sleep(20);
      order.push("first:end");
    });
    const second = withDataLock(async () => {
      order.push("second:start");
      order.push("second:end");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("does not jam the queue when an earlier operation rejects", async () => {
    const order: string[] = [];
    const failing = withDataLock(async () => {
      order.push("failing");
      throw new Error("expected failure");
    });
    const next = withDataLock(async () => {
      order.push("next");
      return "ok";
    });
    await expect(failing).rejects.toThrow("expected failure");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["failing", "next"]);
  });

  it("a write submitted while a pull is mid-flight waits for the whole pull to finish, not just its first step", async () => {
    // Mirrors the exact bug: pullFromCloud's clearAllData() used to be able
    // to run in between a local write's put and the read that follows it.
    // A write that starts once the pull has already begun must not be able
    // to land in the gap between "clear" and "repopulate finishes".
    const order: string[] = [];
    const pull = withDataLock(async () => {
      order.push("pull:clear");
      await sleep(10);
      order.push("pull:repopulate-start");
      await sleep(10);
      order.push("pull:repopulate-end");
    });
    await sleep(1); // let the pull actually acquire the lock first
    const write = withDataLock(async () => {
      order.push("write");
    });
    await Promise.all([pull, write]);
    expect(order).toEqual(["pull:clear", "pull:repopulate-start", "pull:repopulate-end", "write"]);
  });

  it("a write already in flight finishes before a pull that starts afterward can begin clearing", async () => {
    const order: string[] = [];
    const write = withDataLock(async () => {
      order.push("write:start");
      await sleep(10);
      order.push("write:end");
    });
    await sleep(1); // let the write actually acquire the lock first
    const pull = withDataLock(async () => {
      order.push("pull:clear");
    });
    await Promise.all([write, pull]);
    expect(order).toEqual(["write:start", "write:end", "pull:clear"]);
  });
});

function makeItem(identity: string): RawItem {
  return {
    identity,
    itemType: "habit",
    rawName: "Stretching",
    category: "Movement",
    categoryId: null,
    isArchived: false,
    createdDate: "2026-01-01",
    reminderTime: null,
    unit: null,
  };
}

describe("getItemIdentitiesWithHistory / deleteItemLocalInternal", () => {
  it("excludes an item with no logs or diary entries", async () => {
    await putItemInternal(makeItem("habit-no-history"));
    const withHistory = await getItemIdentitiesWithHistory();
    expect(withHistory.has("habit-no-history")).toBe(false);
  });

  it("includes an item with a log entry", async () => {
    await putItemInternal(makeItem("habit-with-log"));
    await putLogInternal({ identity: "log-1", itemIdentity: "habit-with-log", itemType: "habit", date: "2026-01-01", value: 1, updatedAt: "2026-01-01T08:00:00.000Z", mealTag: null });
    const withHistory = await getItemIdentitiesWithHistory();
    expect(withHistory.has("habit-with-log")).toBe(true);
  });

  it("includes an item with only a diary entry, no logs", async () => {
    await putItemInternal(makeItem("habit-with-note"));
    await putDiaryEntryInternal({ identity: "diary-1", itemIdentity: "habit-with-note", itemType: "habit", date: "2026-01-01", content: "note", title: null, updatedAt: "2026-01-01T08:00:00.000Z" });
    const withHistory = await getItemIdentitiesWithHistory();
    expect(withHistory.has("habit-with-note")).toBe(true);
  });

  it("deleteItemLocalInternal removes the item's own row", async () => {
    await putItemInternal(makeItem("habit-to-delete"));
    expect(await getItem("habit-to-delete")).toBeDefined();
    await deleteItemLocalInternal("habit-to-delete");
    expect(await getItem("habit-to-delete")).toBeUndefined();
  });
});

// Regression coverage for the pullFromCloud race the app's architecture
// docs call out: a local write can land after pullFromCloud has already
// fetched its cloud snapshot but before it acquires the lock to install it.
// hasOutboxEntriesSinceInternal is how pullFromCloud detects that and
// retries instead of silently installing a stale snapshot over the write.
// See sync.test.ts for the full end-to-end version of this race.
describe("hasOutboxEntriesSinceInternal", () => {
  // Each test uses its own unique userId — the outbox store isn't cleared
  // between tests, so sharing "user-1" across tests would let an earlier
  // test's entry (created in the same millisecond, since Date.now()'s
  // resolution is coarse) leak into a later test's "since cutoff" check.
  it("is false when nothing has been enqueued for this user since the cutoff", async () => {
    const cutoff = Date.now();
    expect(await hasOutboxEntriesSinceInternal("since-cutoff-empty", cutoff)).toBe(false);
  });

  it("is true once an entry for this user is enqueued at/after the cutoff", async () => {
    const cutoff = Date.now();
    await withDataLock(() =>
      enqueueOutboxInternal({ userId: "since-cutoff-hit", table: "food_items", op: "upsert", payload: { id: "x" }, dedupeKey: "food_items:x" }),
    );
    expect(await hasOutboxEntriesSinceInternal("since-cutoff-hit", cutoff)).toBe(true);
  });

  it("ignores entries created before the cutoff", async () => {
    await withDataLock(() =>
      enqueueOutboxInternal({ userId: "since-cutoff-before", table: "food_items", op: "upsert", payload: { id: "y" }, dedupeKey: "food_items:y" }),
    );
    const cutoffAfterThatWrite = Date.now() + 1;
    expect(await hasOutboxEntriesSinceInternal("since-cutoff-before", cutoffAfterThatWrite)).toBe(false);
  });

  it("ignores entries belonging to a different user", async () => {
    const cutoff = Date.now();
    await withDataLock(() =>
      enqueueOutboxInternal({ userId: "since-cutoff-other-user", table: "food_items", op: "upsert", payload: { id: "z" }, dedupeKey: "food_items:z" }),
    );
    expect(await hasOutboxEntriesSinceInternal("since-cutoff-mine", cutoff)).toBe(false);
  });
});

function makeWorkoutLog(id: string, exercise: string): RawWorkoutLog {
  return { id, date: "2026-01-01", exercise, weightKg: 60, updatedAt: Date.now() };
}

// Regression coverage for: renaming a workout item used to silently break
// getItemIdentitiesWithHistory's "has history" match for it (workout logs
// store a denormalized exercise name, matched by normalizeName against the
// item's CURRENT rawName — see renameWorkoutLogsExerciseInternal's own doc
// comment) — which let the Manage page offer a hard delete for an item that
// actually had real logged history, permanently dead-lettering against
// Supabase's FK once synced.
describe("renameWorkoutLogsExerciseInternal", () => {
  it("reproduces the bug when a rename isn't cascaded, and the cascade fixes it", async () => {
    await putItemInternal({
      identity: "workout-item-1",
      itemType: "workout",
      rawName: "Squat",
      category: "Strength Training",
      categoryId: "cat-1",
      isArchived: false,
      createdDate: "2026-01-01",
      reminderTime: null,
      unit: "kg",
    });
    await putWorkoutLogInternal(makeWorkoutLog("workout-log-1", "Squat"));

    expect((await getItemIdentitiesWithHistory()).has("workout-item-1")).toBe(true);

    // Simulate an uncascaded rename (what the bug looked like): only the
    // item's own rawName changes, workoutLogs still say "Squat".
    await putItemInternal({
      identity: "workout-item-1",
      itemType: "workout",
      rawName: "Squats",
      category: "Strength Training",
      categoryId: "cat-1",
      isArchived: false,
      createdDate: "2026-01-01",
      reminderTime: null,
      unit: "kg",
    });
    expect((await getItemIdentitiesWithHistory()).has("workout-item-1")).toBe(false);

    // The fix: cascading the rename onto workoutLogs restores the match.
    await renameWorkoutLogsExerciseInternal("Squat", "Squats");
    const logs = await getAllWorkoutLogs();
    expect(logs.find((l) => l.id === "workout-log-1")?.exercise).toBe("Squats");
    expect((await getItemIdentitiesWithHistory()).has("workout-item-1")).toBe(true);
  });

  it("matches by normalizeName, not exact string equality, so a casing-only rename still cascades", async () => {
    await putWorkoutLogInternal(makeWorkoutLog("workout-log-2", "deadlift"));
    await renameWorkoutLogsExerciseInternal("Deadlift", "Deadlift (Conventional)");
    const logs = await getAllWorkoutLogs();
    expect(logs.find((l) => l.id === "workout-log-2")?.exercise).toBe("Deadlift (Conventional)");
  });

  it("leaves logs for other exercises untouched", async () => {
    await putWorkoutLogInternal(makeWorkoutLog("workout-log-3", "Bench Press"));
    await renameWorkoutLogsExerciseInternal("Squat", "Squats");
    const logs = await getAllWorkoutLogs();
    expect(logs.find((l) => l.id === "workout-log-3")?.exercise).toBe("Bench Press");
  });
});

function makeLog(id: string, overrides: Partial<RawLog> = {}): RawLog {
  return {
    identity: id,
    itemIdentity: "supp-1",
    itemType: "supplement",
    date: "2026-01-01",
    value: 1,
    updatedAt: "2026-01-01T08:00:00.000Z",
    mealTag: null,
    ...overrides,
  };
}

// Regression coverage for the matching half of the loggedCountsForDate fix
// (src/lib/logCandidates.ts): a legacy untagged row counts as "logged"
// toward every meal tab, so this fallback is what makes tapping that chip
// to un-log it actually remove the right row instead of finding nothing.
describe("decrementDailyLogForMealInternal", () => {
  it("removes the exact tag match when one exists, not an untagged row", async () => {
    await putLogInternal(makeLog("log-exact-untagged", { mealTag: null }));
    await putLogInternal(makeLog("log-exact-morning", { mealTag: "Morning" }));
    const removed = await decrementDailyLogForMealInternal("supp-1", "2026-01-01", "Morning");
    expect(removed?.identity).toBe("log-exact-morning");
  });

  it("falls back to an untagged row when no exact tag match exists", async () => {
    await putLogInternal(makeLog("log-fallback-untagged", { itemIdentity: "supp-2", mealTag: null }));
    const removed = await decrementDailyLogForMealInternal("supp-2", "2026-01-01", "Afternoon");
    expect(removed?.identity).toBe("log-fallback-untagged");
  });

  it("returns null when there's nothing for that item/date at all", async () => {
    const removed = await decrementDailyLogForMealInternal("supp-nonexistent", "2026-01-01", "Morning");
    expect(removed).toBeNull();
  });
});
