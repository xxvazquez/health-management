import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RawItem, RawLog, RawDiaryEntry, RawGymLog, RawCategory, RawStoolLog } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";
import { normalizeName } from "@/taxonomy/normalizeName";

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------
// The durable bridge between a local IndexedDB mutation and Supabase. A
// write is only "safe" once it's either landed on Supabase or is durably
// represented here — see sync.ts's *AndSync functions (where entries are
// created) and outbox.ts (where they're drained).
export type OutboxOperation = "upsert" | "delete";
export type OutboxStatus = "pending" | "dead-letter";

export interface OutboxEntry {
  id: string;
  userId: string;
  /** `${table}:${recordId}` — used to collapse/cancel redundant pending
   * entries for the same record. See `enqueueOutboxInternal`. */
  dedupeKey: string;
  table: string;
  op: OutboxOperation;
  payload: unknown;
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
  status: OutboxStatus;
  lastError?: string;
  lastErrorCode?: string;
}

export type NewOutboxEntry = Pick<OutboxEntry, "userId" | "dedupeKey" | "table" | "op" | "payload">;

interface HealthDbSchema extends DBSchema {
  items: { key: string; value: RawItem; indexes: { itemType: string } };
  logs: { key: string; value: RawLog; indexes: { itemIdentity: string; itemType: string } };
  diary: { key: string; value: RawDiaryEntry; indexes: { itemIdentity: string; itemType: string } };
  categories: { key: string; value: RawCategory; indexes: { itemType: string } };
  stoolLogs: { key: string; value: RawStoolLog };
  gymLogs: { key: string; value: RawGymLog };
  outbox: { key: string; value: OutboxEntry; indexes: { userId: string; status: string; nextAttemptAt: number; dedupeKey: string } };
}

const DB_NAME = "health-analytics";
const DB_VERSION = 8;

let dbPromise: Promise<IDBPDatabase<HealthDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<HealthDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<HealthDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const rawDb = db as unknown as IDBDatabase;
        if (!db.objectStoreNames.contains("items")) {
          const items = db.createObjectStore("items", { keyPath: "identity" });
          items.createIndex("itemType", "itemType");
        }
        if (!db.objectStoreNames.contains("logs")) {
          const logs = db.createObjectStore("logs", { keyPath: "identity" });
          logs.createIndex("itemIdentity", "itemIdentity");
          logs.createIndex("itemType", "itemType");
        }
        if (!db.objectStoreNames.contains("diary")) {
          const diary = db.createObjectStore("diary", { keyPath: "identity" });
          diary.createIndex("itemIdentity", "itemIdentity");
          diary.createIndex("itemType", "itemType");
        }
        if (!db.objectStoreNames.contains("categories")) {
          const categories = db.createObjectStore("categories", { keyPath: "id" });
          categories.createIndex("itemType", "itemType");
        }
        if (!db.objectStoreNames.contains("stoolLogs")) {
          db.createObjectStore("stoolLogs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("gymLogs")) {
          db.createObjectStore("gymLogs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "id" });
          outbox.createIndex("userId", "userId");
          outbox.createIndex("status", "status");
          outbox.createIndex("nextAttemptAt", "nextAttemptAt");
          outbox.createIndex("dedupeKey", "dedupeKey");
        }
        // Stale stores from the pre-redesign schema (single shared
        // items/logs/diary tables, name-matched classification via
        // userOverrides, a flat userCategories list) — this database is a
        // Supabase-backed cache, re-populated by pullFromCloud() on
        // sign-in, not the durable copy, so dropping them outright is safe.
        for (const stale of ["imports", "habits", "events", "meta", "userOverrides", "userCategories"]) {
          if (rawDb.objectStoreNames.contains(stale)) {
            rawDb.deleteObjectStore(stale);
          }
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Write lock
// ---------------------------------------------------------------------------
// A local write (e.g. tapping to log a food) and a cloud pull's destructive
// clear-and-repopulate (pullFromCloud, triggered on sign-in and whenever the
// tab regains focus) both mutate this same IndexedDB database. Without
// coordination, a pull's clear can land in between a local write and the
// read that follows it, silently erasing the write or exposing a
// half-repopulated cache. `withDataLock` serializes every mutation (and
// pullFromCloud's whole clear+repopulate sequence, as one unit) through a
// single FIFO queue: whichever starts first runs to completion before the
// next one begins. Scoped to this one module/tab — it does not coordinate
// across browser tabs.
//
// sync.ts's *AndSync functions also rely on this: a record mutation and its
// outbox entry are written inside the SAME withDataLock call, so a pull can
// never land in between "the record was written" and "the outbox entry
// exists for it".
let dataLockQueue: Promise<unknown> = Promise.resolve();

export function withDataLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = dataLockQueue.then(fn, fn);
  dataLockQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function getAllItems(): Promise<RawItem[]> {
  return (await getDb()).getAll("items");
}

export async function getItem(identity: string): Promise<RawItem | undefined> {
  return (await getDb()).get("items", identity);
}

/** Raw, unlocked write — for pullFromCloud's and sync.ts's *AndSync
 * functions' own use only (they already hold the lock for their whole
 * operation; re-acquiring here would deadlock). Every other caller should
 * use `putItem`. */
export async function putItemInternal(item: RawItem): Promise<void> {
  const db = await getDb();
  await db.put("items", item);
}

export function putItem(item: RawItem): Promise<void> {
  return withDataLock(() => putItemInternal(item));
}

/** Every item identity with at least one log or diary entry. Every
 * `*_logs`/`*_diary` table has an `on delete restrict` FK to its item
 * table (see supabase/schema.sql) — an item in this set can only ever be
 * archived, never hard-deleted, since Supabase would reject the delete.
 * Checked before offering Delete in the UI rather than just surfacing the
 * server's rejection after the fact.
 *
 * Workout items are matched into this set by name rather than by
 * `itemIdentity` (`workout_logs` has no `itemIdentity` column — see
 * `RawGymLog`'s own comment) — same resolution sync.ts uses at the push/
 * pull boundary. */
export async function getItemIdentitiesWithHistory(): Promise<Set<string>> {
  const db = await getDb();
  const [logs, diary, items, gymLogs] = await Promise.all([
    db.getAll("logs"),
    db.getAll("diary"),
    db.getAll("items"),
    db.getAll("gymLogs"),
  ]);
  const withHistory = new Set([...logs.map((l) => l.itemIdentity), ...diary.map((d) => d.itemIdentity)]);
  const gymExerciseNames = new Set(gymLogs.map((g) => normalizeName(g.exercise)));
  for (const item of items) {
    if (item.itemType === "workout" && gymExerciseNames.has(normalizeName(item.rawName))) {
      withHistory.add(item.identity);
    }
  }
  return withHistory;
}

/** Raw, unlocked delete — see `putItemInternal`. Only safe for an item
 * with no logs/diary history (see `getItemIdentitiesWithHistory`); every
 * caller must check that first. */
export async function deleteItemLocalInternal(identity: string): Promise<void> {
  const db = await getDb();
  await db.delete("items", identity);
}

export async function getAllLogs(): Promise<RawLog[]> {
  return (await getDb()).getAll("logs");
}

export async function getLogsForItemOnDate(itemIdentity: string, date: string): Promise<RawLog[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("logs", "itemIdentity", itemIdentity);
  return all.filter((l) => l.date === date);
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function putLogInternal(log: RawLog): Promise<void> {
  const db = await getDb();
  await db.put("logs", log);
}

export function putLog(log: RawLog): Promise<void> {
  return withDataLock(() => putLogInternal(log));
}

/** Raw, unlocked delete — see `putItemInternal`. */
export async function deleteLogByIdInternal(identity: string): Promise<void> {
  const db = await getDb();
  await db.delete("logs", identity);
}

/** Deletes one specific log entry by its own identity — used to undo a
 * specific mistaken tap from the day's timeline. */
export function deleteLogById(identity: string): Promise<void> {
  return withDataLock(() => deleteLogByIdInternal(identity));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function updateLogMealTagInternal(identity: string, mealTag: string | null): Promise<RawLog | null> {
  const db = await getDb();
  const log = await db.get("logs", identity);
  if (!log) return null;
  const updated = { ...log, mealTag };
  await db.put("logs", updated);
  return updated;
}

/** Corrects the meal tag on an already-logged entry — for fixing a mistake
 * after the fact, not just at the moment of logging. Leaves `updatedAt`
 * untouched so the entry keeps its original time and timeline position;
 * only the tag itself changes. */
export function updateLogMealTag(identity: string, mealTag: string | null): Promise<RawLog | null> {
  return withDataLock(() => updateLogMealTagInternal(identity, mealTag));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function updateLogTimeInternal(identity: string, updatedAt: string): Promise<RawLog | null> {
  const db = await getDb();
  const log = await db.get("logs", identity);
  if (!log) return null;
  const updated = { ...log, updatedAt };
  await db.put("logs", updated);
  return updated;
}

/** Corrects when an entry actually happened — unlike `updateLogMealTag`,
 * this deliberately rewrites `updatedAt` itself, since that field doubles
 * as "the moment it was logged" everywhere the timeline reads it. */
export function updateLogTime(identity: string, updatedAt: string): Promise<RawLog | null> {
  return withDataLock(() => updateLogTimeInternal(identity, updatedAt));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function toggleDailyLogInternal(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
): Promise<{ logged: boolean; added: RawLog | null; removed: RawLog[] }> {
  const db = await getDb();
  const tx = db.transaction("logs", "readwrite");
  const existing = await tx.store.index("itemIdentity").getAll(itemIdentity);
  const sameDay = existing.filter((l) => l.date === date);

  if (sameDay.length > 0) {
    await Promise.all(sameDay.map((l) => tx.store.delete(l.identity)));
    await tx.done;
    return { logged: false, added: null, removed: sameDay };
  }

  const log: RawLog = {
    identity: crypto.randomUUID(),
    itemIdentity,
    itemType,
    date,
    value: 1,
    updatedAt: new Date().toISOString(),
    mealTag: null,
  };
  await tx.store.put(log);
  await tx.done;
  return { logged: true, added: log, removed: [] };
}

/**
 * Logs or unlogs an item for a given day, from the Log page. Treats
 * "logged today" as a single fact regardless of how many rows exist: if any
 * log already exists for this item on this date, tapping clears all of
 * them; otherwise it writes one new log. Returns the new logged state
 * (true = now logged), plus every log identity that was written or removed
 * — the caller pushes/deletes those same rows in Supabase.
 */
export function toggleDailyLog(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
): Promise<{ logged: boolean; added: RawLog | null; removed: RawLog[] }> {
  return withDataLock(() => toggleDailyLogInternal(itemIdentity, itemType, date));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function incrementDailyLogInternal(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
  mealTag: string | null = null,
): Promise<RawLog> {
  const db = await getDb();
  const log: RawLog = {
    identity: crypto.randomUUID(),
    itemIdentity,
    itemType,
    date,
    value: 1,
    updatedAt: new Date().toISOString(),
    mealTag,
  };
  await db.put("logs", log);
  return log;
}

/**
 * Adds one more occurrence of an item on a day (e.g. a second banana), as a
 * new log row — one row = one occurrence, so no aggregation code needs to
 * know about a "count" field. `mealTag` is set from the Log page's meal
 * selector, not derived from `updatedAt` — logging breakfast at night still
 * tags it as breakfast.
 */
export function incrementDailyLog(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
  mealTag: string | null = null,
): Promise<RawLog> {
  return withDataLock(() => incrementDailyLogInternal(itemIdentity, itemType, date, mealTag));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function setDailyDurationInternal(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
  totalMinutes: number,
): Promise<RawLog> {
  const db = await getDb();
  const tx = db.transaction("logs", "readwrite");
  const existing = (await tx.store.index("itemIdentity").getAll(itemIdentity)).find((l) => l.date === date);
  const log: RawLog = {
    identity: existing?.identity ?? crypto.randomUUID(),
    itemIdentity,
    itemType,
    date,
    value: totalMinutes,
    updatedAt: new Date().toISOString(),
    mealTag: null,
  };
  await tx.store.put(log);
  await tx.done;
  return log;
}

/**
 * Sets (or overwrites) a duration-kind item's value for a day — a plain
 * magnitude, not an occurrence count, so this upserts one log per item per
 * day (reusing whatever row already exists for that item+date, if any)
 * rather than adding a new row each time.
 */
export function setDailyDuration(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
  totalMinutes: number,
): Promise<RawLog> {
  return withDataLock(() => setDailyDurationInternal(itemIdentity, itemType, date, totalMinutes));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function decrementDailyLogInternal(itemIdentity: string, date: string): Promise<RawLog | null> {
  const db = await getDb();
  const tx = db.transaction("logs", "readwrite");
  const sameDay = (await tx.store.index("itemIdentity").getAll(itemIdentity)).filter((l) => l.date === date);
  if (sameDay.length === 0) {
    await tx.done;
    return null;
  }
  const target = sameDay[0];
  await tx.store.delete(target.identity);
  await tx.done;
  return target;
}

/**
 * Removes one occurrence of an item on a day. Returns the removed row (so
 * the caller can delete the same id remotely), or null if there was
 * nothing left to remove.
 */
export function decrementDailyLog(itemIdentity: string, date: string): Promise<RawLog | null> {
  return withDataLock(() => decrementDailyLogInternal(itemIdentity, date));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function decrementDailyLogForMealInternal(
  itemIdentity: string,
  date: string,
  mealTag: string | null,
): Promise<RawLog | null> {
  const db = await getDb();
  const tx = db.transaction("logs", "readwrite");
  const sameMeal = (await tx.store.index("itemIdentity").getAll(itemIdentity)).filter(
    (l) => l.date === date && l.mealTag === mealTag,
  );
  if (sameMeal.length === 0) {
    await tx.done;
    return null;
  }
  const target = sameMeal[0];
  await tx.store.delete(target.identity);
  await tx.done;
  return target;
}

/**
 * Same as `decrementDailyLog`, but only removes a row tagged with the given
 * meal — so un-tapping "Milk" while viewing Lunch removes today's lunch
 * milk, not the breakfast one, when the same food was logged at more than
 * one meal.
 */
export function decrementDailyLogForMeal(
  itemIdentity: string,
  date: string,
  mealTag: string | null,
): Promise<RawLog | null> {
  return withDataLock(() => decrementDailyLogForMealInternal(itemIdentity, date, mealTag));
}

export async function getAllDiary(): Promise<RawDiaryEntry[]> {
  return (await getDb()).getAll("diary");
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function putDiaryEntryInternal(entry: RawDiaryEntry): Promise<void> {
  const db = await getDb();
  await db.put("diary", entry);
}

export function putDiaryEntry(entry: RawDiaryEntry): Promise<void> {
  return withDataLock(() => putDiaryEntryInternal(entry));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function setDiaryNoteInternal(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
  content: string | null,
): Promise<RawDiaryEntry> {
  const db = await getDb();
  const tx = db.transaction("diary", "readwrite");
  const existing = (await tx.store.index("itemIdentity").getAll(itemIdentity)).find((d) => d.date === date);
  const entry: RawDiaryEntry = {
    identity: existing?.identity ?? crypto.randomUUID(),
    itemIdentity,
    itemType,
    date,
    content,
    title: null,
    updatedAt: new Date().toISOString(),
  };
  await tx.store.put(entry);
  await tx.done;
  return entry;
}

/**
 * Sets (or clears, with `content: null`) the optional note for one item on
 * one day — one note per item+day, reusing whatever diary row already
 * exists for that item+date rather than creating a duplicate.
 */
export function setDiaryNote(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
  content: string | null,
): Promise<RawDiaryEntry> {
  return withDataLock(() => setDiaryNoteInternal(itemIdentity, itemType, date, content));
}

export async function getAllCategories(): Promise<RawCategory[]> {
  return (await getDb()).getAll("categories");
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function putCategoryInternal(entry: RawCategory): Promise<void> {
  const db = await getDb();
  await db.put("categories", entry);
}

export function putCategory(entry: RawCategory): Promise<void> {
  return withDataLock(() => putCategoryInternal(entry));
}

/** Raw, unlocked delete — see `putItemInternal`. */
export async function deleteCategoryLocalInternal(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("categories", id);
}

export async function getAllStoolLogs(): Promise<RawStoolLog[]> {
  return (await getDb()).getAll("stoolLogs");
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function putStoolLogInternal(log: RawStoolLog): Promise<void> {
  const db = await getDb();
  await db.put("stoolLogs", log);
}

export function putStoolLog(log: RawStoolLog): Promise<void> {
  return withDataLock(() => putStoolLogInternal(log));
}

/** Raw, unlocked delete — see `putItemInternal`. */
export async function deleteStoolLogByIdInternal(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("stoolLogs", id);
}

export function deleteStoolLogById(id: string): Promise<void> {
  return withDataLock(() => deleteStoolLogByIdInternal(id));
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function updateStoolLogTimeInternal(id: string, loggedAt: string): Promise<RawStoolLog | null> {
  const db = await getDb();
  const log = await db.get("stoolLogs", id);
  if (!log) return null;
  const updated = { ...log, loggedAt };
  await db.put("stoolLogs", updated);
  return updated;
}

/** Corrects when a bowel movement actually happened — same rationale as
 * `updateLogTime`, `loggedAt` is the field the Stool tab and timeline both
 * read for display and ordering. */
export function updateStoolLogTime(id: string, loggedAt: string): Promise<RawStoolLog | null> {
  return withDataLock(() => updateStoolLogTimeInternal(id, loggedAt));
}

export async function getAllGymLogs(): Promise<RawGymLog[]> {
  return (await getDb()).getAll("gymLogs");
}

/** Raw, unlocked write — see `putItemInternal`. */
export async function putGymLogInternal(log: RawGymLog): Promise<void> {
  const db = await getDb();
  await db.put("gymLogs", log);
}

export function putGymLog(log: RawGymLog): Promise<void> {
  return withDataLock(() => putGymLogInternal(log));
}

/** Raw, unlocked delete — see `putItemInternal`. */
export async function deleteGymLogByIdInternal(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("gymLogs", id);
}

export function deleteGymLogById(id: string): Promise<void> {
  return withDataLock(() => deleteGymLogByIdInternal(id));
}

export async function hasAnyData(): Promise<boolean> {
  const db = await getDb();
  const [logCount, stoolCount] = await Promise.all([db.count("logs"), db.count("stoolLogs")]);
  return logCount > 0 || stoolCount > 0;
}

/** Raw, unlocked write — for pullFromCloud's own use only. Every other
 * caller (e.g. DataContext's "clear my data" action) should use
 * `clearAllData`. */
export async function clearAllDataInternal(): Promise<void> {
  const db = await getDb();
  const stores = ["items", "logs", "diary", "categories", "stoolLogs", "gymLogs"] as const;
  const tx = db.transaction(stores, "readwrite");
  await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done]);
}

export function clearAllData(): Promise<void> {
  return withDataLock(clearAllDataInternal);
}

// ---------------------------------------------------------------------------
// Outbox CRUD
// ---------------------------------------------------------------------------

/**
 * Inserts (or collapses into an existing) outbox entry. Raw/unlocked — for
 * use inside another already-locked block (sync.ts's *AndSync functions),
 * so a record's mutation and its outbox entry are written atomically. Every
 * other caller should use `enqueueOutbox`.
 *
 * Dedup rules (deliberately narrow — see Step 2 spec's "do not blindly
 * deduplicate every queued operation"):
 *  - A new "upsert" collapses into an existing PENDING, UNATTEMPTED
 *    "upsert" for the same record (same dedupeKey): only the latest
 *    payload matters, and nothing has been sent yet, so there's nothing to
 *    preserve about the older one. An upsert that's already been attempted
 *    at least once is left alone — it might already be in flight or
 *    partially processed remotely, so a new entry is queued behind it
 *    instead of being merged into it.
 *  - A new "delete" cancels (removes outright, not marks) an existing
 *    PENDING, UNATTEMPTED "upsert" for the same record: since that create
 *    was never sent, there's nothing remote to delete — sending a
 *    create-then-delete pair for a record that never left the device would
 *    be pure waste.
 *  - Every other combination (an attempted upsert followed by a delete, a
 *    delete followed by a new upsert, two deletes, etc.) is appended as a
 *    new entry and drained in order — collapsing those could change
 *    semantics (e.g. silently dropping a real delete), which is exactly
 *    what the spec warns against.
 */
export async function enqueueOutboxInternal(entry: NewOutboxEntry): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllFromIndex("outbox", "dedupeKey", entry.dedupeKey);
  const pendingUnattempted = existing.find((e) => e.status === "pending" && e.attempts === 0);

  if (entry.op === "upsert" && pendingUnattempted?.op === "upsert") {
    const updated: OutboxEntry = { ...pendingUnattempted, payload: entry.payload, createdAt: Date.now(), nextAttemptAt: Date.now() };
    await db.put("outbox", updated);
    return;
  }
  if (entry.op === "delete" && pendingUnattempted?.op === "upsert") {
    await db.delete("outbox", pendingUnattempted.id);
    return;
  }

  const row: OutboxEntry = {
    id: crypto.randomUUID(),
    userId: entry.userId,
    dedupeKey: entry.dedupeKey,
    table: entry.table,
    op: entry.op,
    payload: entry.payload,
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
    status: "pending",
  };
  await db.put("outbox", row);
}

export function enqueueOutbox(entry: NewOutboxEntry): Promise<void> {
  return withDataLock(() => enqueueOutboxInternal(entry));
}

export async function getAllOutboxEntries(): Promise<OutboxEntry[]> {
  return (await getDb()).getAll("outbox");
}

/** Every entry currently eligible to send: status "pending" and its retry
 * backoff has elapsed. Ordered oldest-first so operations on the same
 * record drain in the order they were made. */
export async function getEligibleOutboxEntries(now: number = Date.now()): Promise<OutboxEntry[]> {
  const db = await getDb();
  const pending = await db.getAllFromIndex("outbox", "status", "pending");
  return pending.filter((e) => e.nextAttemptAt <= now).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getOutboxCounts(userId: string): Promise<{ pending: number; deadLetter: number }> {
  const all = (await getAllOutboxEntries()).filter((e) => e.userId === userId);
  return {
    pending: all.filter((e) => e.status === "pending").length,
    deadLetter: all.filter((e) => e.status === "dead-letter").length,
  };
}

/** The actual dead-letter rows for the current user — enough detail
 * (table, lastErrorCode) to explain to the user what failed, without the
 * caller needing to scan every outbox entry itself. */
export async function getDeadLetterOutboxEntries(userId: string): Promise<OutboxEntry[]> {
  const all = await getAllOutboxEntries();
  return all.filter((e) => e.userId === userId && e.status === "dead-letter");
}

export function updateOutboxEntry(id: string, patch: Partial<OutboxEntry>): Promise<void> {
  return withDataLock(async () => {
    const db = await getDb();
    const existing = await db.get("outbox", id);
    if (!existing) return;
    await db.put("outbox", { ...existing, ...patch });
  });
}

export function deleteOutboxEntryById(id: string): Promise<void> {
  return withDataLock(async () => {
    const db = await getDb();
    await db.delete("outbox", id);
  });
}
