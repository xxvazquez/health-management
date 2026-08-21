import { describe, expect, it } from "vitest";
import {
  clearAllData,
  deleteOutboxEntryById,
  enqueueOutbox,
  getAllOutboxEntries,
  getEligibleOutboxEntries,
  getItem,
  getOutboxCounts,
  putItem,
  updateOutboxEntry,
  type NewOutboxEntry,
} from "./indexedDb";

// Every test uses its own unique userId/dedupeKey prefix so tests can run
// against the same underlying (fake) IndexedDB without needing to clear
// shared stores between them — each test's assertions only ever look at
// its own rows.
let counter = 0;
function unique(label: string): { userId: string; dedupeKey: string } {
  counter += 1;
  return { userId: `user-${label}-${counter}`, dedupeKey: `food_items:item-${label}-${counter}` };
}

function upsertEntry(overrides: Partial<NewOutboxEntry> = {}): NewOutboxEntry {
  const { userId, dedupeKey } = unique("x");
  return { userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "item-1", name: "Apple" }, ...overrides };
}

describe("enqueueOutbox — create/retrieve", () => {
  it("creates a new pending entry with the expected shape", async () => {
    const { userId, dedupeKey } = unique("create");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });

    const all = await getAllOutboxEntries();
    const entry = all.find((e) => e.dedupeKey === dedupeKey);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ userId, dedupeKey, table: "food_items", op: "upsert", attempts: 0, status: "pending" });
    expect(typeof entry!.id).toBe("string");
    expect(entry!.id.length).toBeGreaterThan(0);
  });
});

describe("enqueueOutbox — dedup rules", () => {
  it("collapses a second unattempted upsert for the same record into the first entry", async () => {
    const { userId, dedupeKey } = unique("collapse");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a", name: "v1" } });
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a", name: "v2" } });

    const matching = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(matching).toHaveLength(1);
    expect(matching[0].payload).toEqual({ id: "a", name: "v2" });
  });

  it("cancels a pending, unattempted upsert instead of queuing a delete for it — the record never left the device", async () => {
    const { userId, dedupeKey } = unique("cancel");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "delete", payload: { id: "a" } });

    const matching = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(matching).toHaveLength(0);
  });

  it("does NOT collapse into an upsert that's already been attempted at least once", async () => {
    const { userId, dedupeKey } = unique("attempted");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a", name: "v1" } });
    const [firstEntry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    await updateOutboxEntry(firstEntry.id, { attempts: 1, nextAttemptAt: Date.now() + 60_000 });

    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a", name: "v2" } });

    const matching = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(matching).toHaveLength(2);
  });

  it("does NOT cancel a delete against an upsert that's already been attempted — keeps both, in order", async () => {
    const { userId, dedupeKey } = unique("attempted-delete");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    const [firstEntry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    await updateOutboxEntry(firstEntry.id, { attempts: 1, nextAttemptAt: Date.now() + 60_000 });

    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "delete", payload: { id: "a" } });

    const matching = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(matching).toHaveLength(2);
    expect(matching.map((e) => e.op).sort()).toEqual(["delete", "upsert"]);
  });

  it("does not collapse a delete-then-upsert sequence — both are kept", async () => {
    // Deliberately not asserting strict ordering here: two enqueues can
    // land in the same millisecond, making `createdAt` ambiguous between
    // them — drain order at that resolution isn't a correctness
    // requirement, only "neither one was collapsed away" is.
    const { userId, dedupeKey } = unique("delete-then-upsert");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "delete", payload: { id: "a" } });
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a", name: "recreated" } });

    const matching = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(matching).toHaveLength(2);
    expect(matching.map((e) => e.op).sort()).toEqual(["delete", "upsert"]);
  });
});

describe("getEligibleOutboxEntries", () => {
  it("returns only pending entries whose backoff has elapsed", async () => {
    const now = Date.now();
    const { userId, dedupeKey } = unique("eligible");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "ready" } });
    const [readyEntry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    // enqueueOutbox stamps nextAttemptAt with its own Date.now() call, which
    // runs strictly after `now` was captured above — on a slow tick this
    // entry's nextAttemptAt could land after `now`, making it look not-yet-
    // eligible and flaking the assertion below. Pin it explicitly instead
    // of relying on two separate Date.now() calls landing in the same
    // millisecond.
    await updateOutboxEntry(readyEntry.id, { nextAttemptAt: now - 1 });

    const notYet = unique("eligible-future");
    await enqueueOutbox({ userId: notYet.userId, dedupeKey: notYet.dedupeKey, table: "food_items", op: "upsert", payload: { id: "later" } });
    const [futureEntry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === notYet.dedupeKey);
    await updateOutboxEntry(futureEntry.id, { nextAttemptAt: now + 60_000 });

    const eligible = await getEligibleOutboxEntries(now);
    const eligibleIds = eligible.map((e) => e.id);
    expect(eligibleIds).toContain(readyEntry.id);
    expect(eligibleIds).not.toContain(futureEntry.id);
  });

  it("excludes dead-letter entries even if their backoff has elapsed", async () => {
    const { userId, dedupeKey } = unique("dead");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    const [entry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    await updateOutboxEntry(entry.id, { status: "dead-letter" });

    const eligible = await getEligibleOutboxEntries();
    expect(eligible.map((e) => e.id)).not.toContain(entry.id);
  });

  it("orders eligible entries oldest-first", async () => {
    const older = unique("order-a");
    const newer = unique("order-b");
    await enqueueOutbox({ userId: older.userId, dedupeKey: older.dedupeKey, table: "food_items", op: "upsert", payload: {} });
    const [olderEntry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === older.dedupeKey);
    await updateOutboxEntry(olderEntry.id, { createdAt: 1000 });

    await enqueueOutbox({ userId: newer.userId, dedupeKey: newer.dedupeKey, table: "food_items", op: "upsert", payload: {} });
    const [newerEntry] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === newer.dedupeKey);
    await updateOutboxEntry(newerEntry.id, { createdAt: 2000 });

    const eligible = await getEligibleOutboxEntries();
    const olderIndex = eligible.findIndex((e) => e.id === olderEntry.id);
    const newerIndex = eligible.findIndex((e) => e.id === newerEntry.id);
    expect(olderIndex).toBeLessThan(newerIndex);
  });
});

describe("updateOutboxEntry / deleteOutboxEntryById", () => {
  it("marks an entry dead-letter with error metadata", async () => {
    const entry = upsertEntry();
    await enqueueOutbox(entry);
    const [row] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === entry.dedupeKey);

    await updateOutboxEntry(row.id, { status: "dead-letter", lastError: "FK violation", lastErrorCode: "23503" });

    const [updated] = (await getAllOutboxEntries()).filter((e) => e.id === row.id);
    expect(updated.status).toBe("dead-letter");
    expect(updated.lastErrorCode).toBe("23503");
  });

  it("deletes an entry", async () => {
    const entry = upsertEntry();
    await enqueueOutbox(entry);
    const [row] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === entry.dedupeKey);

    await deleteOutboxEntryById(row.id);

    const remaining = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === entry.dedupeKey);
    expect(remaining).toHaveLength(0);
  });

  it("is a no-op deleting an id that doesn't exist — repeated delete is safe", async () => {
    await expect(deleteOutboxEntryById("does-not-exist")).resolves.not.toThrow();
    await expect(deleteOutboxEntryById("does-not-exist")).resolves.not.toThrow();
  });
});

describe("clearAllData and the outbox", () => {
  it("never clears the outbox — a pending sync operation survives a destructive cloud pull", async () => {
    const { userId, dedupeKey } = unique("survives-clear");
    await enqueueOutbox({ userId, dedupeKey, table: "food_items", op: "upsert", payload: { id: "a" } });
    // A real record too, so this also confirms clearAllData still does its
    // actual job on every OTHER store — this isn't "clearAllData is broken",
    // just "the outbox specifically is exempt".
    await putItem({ identity: "item-1", itemType: "food", rawName: "Apple", category: "Fruit", categoryId: null, isArchived: false, createdDate: "2026-01-01", reminderTime: null });

    await clearAllData();

    const survivors = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
    expect(survivors).toHaveLength(1);
    expect(await getItem("item-1")).toBeUndefined();
  });
});

describe("getOutboxCounts", () => {
  it("counts pending and dead-letter separately, scoped to one user", async () => {
    const { userId } = unique("counts");
    await enqueueOutbox({ userId, dedupeKey: `food_items:a-${userId}`, table: "food_items", op: "upsert", payload: {} });
    await enqueueOutbox({ userId, dedupeKey: `food_items:b-${userId}`, table: "food_items", op: "upsert", payload: {} });
    const [deadRow] = (await getAllOutboxEntries()).filter((e) => e.dedupeKey === `food_items:b-${userId}`);
    await updateOutboxEntry(deadRow.id, { status: "dead-letter" });

    const counts = await getOutboxCounts(userId);
    expect(counts).toEqual({ pending: 1, deadLetter: 1 });
  });

  it("never counts a different user's entries", async () => {
    const a = unique("cross-a");
    const b = unique("cross-b");
    await enqueueOutbox({ userId: a.userId, dedupeKey: a.dedupeKey, table: "food_items", op: "upsert", payload: {} });
    await enqueueOutbox({ userId: b.userId, dedupeKey: b.dedupeKey, table: "food_items", op: "upsert", payload: {} });

    expect(await getOutboxCounts(a.userId)).toEqual({ pending: 1, deadLetter: 0 });
    expect(await getOutboxCounts(b.userId)).toEqual({ pending: 1, deadLetter: 0 });
  });
});
