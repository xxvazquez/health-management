import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RawItem, RawLog, RawDiaryEntry, RawGymLog, RawCategory, RawStoolLog } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";

interface HealthDbSchema extends DBSchema {
  items: { key: string; value: RawItem; indexes: { itemType: string } };
  logs: { key: string; value: RawLog; indexes: { itemIdentity: string; itemType: string } };
  diary: { key: string; value: RawDiaryEntry; indexes: { itemIdentity: string; itemType: string } };
  categories: { key: string; value: RawCategory; indexes: { itemType: string } };
  stoolLogs: { key: string; value: RawStoolLog };
  gymLogs: { key: string; value: RawGymLog };
}

const DB_NAME = "health-analytics";
const DB_VERSION = 7;

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

/** Raw, unlocked write — for pullFromCloud's own use only (it already holds
 * the lock for its whole clear+repopulate sequence; re-acquiring here would
 * deadlock). Every other caller should use `putItem`. */
export async function putItemInternal(item: RawItem): Promise<void> {
  const db = await getDb();
  await db.put("items", item);
}

export function putItem(item: RawItem): Promise<void> {
  return withDataLock(() => putItemInternal(item));
}

export async function getAllLogs(): Promise<RawLog[]> {
  return (await getDb()).getAll("logs");
}

export async function getLogsForItemOnDate(itemIdentity: string, date: string): Promise<RawLog[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("logs", "itemIdentity", itemIdentity);
  return all.filter((l) => l.date === date);
}

export async function getLogById(identity: string): Promise<RawLog | undefined> {
  const db = await getDb();
  return db.get("logs", identity);
}

/** Raw, unlocked write — for pullFromCloud's own use only. Every other
 * caller should use `putLog`. */
export async function putLogInternal(log: RawLog): Promise<void> {
  const db = await getDb();
  await db.put("logs", log);
}

export function putLog(log: RawLog): Promise<void> {
  return withDataLock(() => putLogInternal(log));
}

/** Deletes one specific log entry by its own identity — used to undo a
 * specific mistaken tap from the day's timeline. */
export function deleteLogById(identity: string): Promise<void> {
  return withDataLock(async () => {
    const db = await getDb();
    await db.delete("logs", identity);
  });
}

/** Corrects the meal tag on an already-logged entry — for fixing a mistake
 * after the fact, not just at the moment of logging. Leaves `updatedAt`
 * untouched so the entry keeps its original time and timeline position;
 * only the tag itself changes. */
export function updateLogMealTag(identity: string, mealTag: string | null): Promise<RawLog | null> {
  return withDataLock(async () => {
    const db = await getDb();
    const log = await db.get("logs", identity);
    if (!log) return null;
    const updated = { ...log, mealTag };
    await db.put("logs", updated);
    return updated;
  });
}

/** Corrects when an entry actually happened — unlike `updateLogMealTag`,
 * this deliberately rewrites `updatedAt` itself, since that field doubles
 * as "the moment it was logged" everywhere the timeline reads it. */
export function updateLogTime(identity: string, updatedAt: string): Promise<RawLog | null> {
  return withDataLock(async () => {
    const db = await getDb();
    const log = await db.get("logs", identity);
    if (!log) return null;
    const updated = { ...log, updatedAt };
    await db.put("logs", updated);
    return updated;
  });
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
  return withDataLock(async () => {
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
  });
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
  return withDataLock(async () => {
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
  });
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
  return withDataLock(async () => {
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
  });
}

/**
 * Removes one occurrence of an item on a day. Returns the removed row (so
 * the caller can delete the same id remotely), or null if there was
 * nothing left to remove.
 */
export function decrementDailyLog(itemIdentity: string, date: string): Promise<RawLog | null> {
  return withDataLock(async () => {
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
  });
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
  return withDataLock(async () => {
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
  });
}

export async function getAllDiary(): Promise<RawDiaryEntry[]> {
  return (await getDb()).getAll("diary");
}

/** Raw, unlocked write — for pullFromCloud's own use only. Every other
 * caller should use `putDiaryEntry`. */
export async function putDiaryEntryInternal(entry: RawDiaryEntry): Promise<void> {
  const db = await getDb();
  await db.put("diary", entry);
}

export function putDiaryEntry(entry: RawDiaryEntry): Promise<void> {
  return withDataLock(() => putDiaryEntryInternal(entry));
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
  return withDataLock(async () => {
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
  });
}

export async function getAllCategories(): Promise<RawCategory[]> {
  return (await getDb()).getAll("categories");
}

/** Raw, unlocked write — for pullFromCloud's own use only. Every other
 * caller should use `putCategory`. */
export async function putCategoryInternal(entry: RawCategory): Promise<void> {
  const db = await getDb();
  await db.put("categories", entry);
}

export function putCategory(entry: RawCategory): Promise<void> {
  return withDataLock(() => putCategoryInternal(entry));
}

export function deleteCategoryLocal(id: string): Promise<void> {
  return withDataLock(async () => {
    const db = await getDb();
    await db.delete("categories", id);
  });
}

export async function getAllStoolLogs(): Promise<RawStoolLog[]> {
  return (await getDb()).getAll("stoolLogs");
}

/** Raw, unlocked write — for pullFromCloud's own use only. Every other
 * caller should use `putStoolLog`. */
export async function putStoolLogInternal(log: RawStoolLog): Promise<void> {
  const db = await getDb();
  await db.put("stoolLogs", log);
}

export function putStoolLog(log: RawStoolLog): Promise<void> {
  return withDataLock(() => putStoolLogInternal(log));
}

export function deleteStoolLogById(id: string): Promise<void> {
  return withDataLock(async () => {
    const db = await getDb();
    await db.delete("stoolLogs", id);
  });
}

/** Corrects when a bowel movement actually happened — same rationale as
 * `updateLogTime`, `loggedAt` is the field the Stool tab and timeline both
 * read for display and ordering. */
export function updateStoolLogTime(id: string, loggedAt: string): Promise<RawStoolLog | null> {
  return withDataLock(async () => {
    const db = await getDb();
    const log = await db.get("stoolLogs", id);
    if (!log) return null;
    const updated = { ...log, loggedAt };
    await db.put("stoolLogs", updated);
    return updated;
  });
}

export async function getAllGymLogs(): Promise<RawGymLog[]> {
  return (await getDb()).getAll("gymLogs");
}

/** Raw, unlocked write — for pullFromCloud's own use only. Every other
 * caller should use `putGymLog`. */
export async function putGymLogInternal(log: RawGymLog): Promise<void> {
  const db = await getDb();
  await db.put("gymLogs", log);
}

export function putGymLog(log: RawGymLog): Promise<void> {
  return withDataLock(() => putGymLogInternal(log));
}

export function deleteGymLogById(id: string): Promise<void> {
  return withDataLock(async () => {
    const db = await getDb();
    await db.delete("gymLogs", id);
  });
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
