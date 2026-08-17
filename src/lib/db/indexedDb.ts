import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RawItem, RawLog, RawDiaryEntry, RawGymLog } from "@/lib/types";
import type { OverrideEntry } from "@/taxonomy/classify";

interface HealthDbSchema extends DBSchema {
  items: { key: string; value: RawItem };
  logs: { key: string; value: RawLog; indexes: { itemIdentity: string } };
  diary: { key: string; value: RawDiaryEntry; indexes: { itemIdentity: string } };
  meta: { key: string; value: unknown };
  // Keyed by the same normalized-name key as taxonomy/overrides.json, so an
  // item logged directly (never seen anywhere else) still classifies
  // correctly wherever it's rendered.
  userOverrides: { key: string; value: OverrideEntry };
  gymLogs: { key: string; value: RawGymLog };
}

const DB_NAME = "health-analytics";
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<HealthDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<HealthDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<HealthDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const rawDb = db as unknown as IDBDatabase;
        if (!db.objectStoreNames.contains("items")) {
          db.createObjectStore("items", { keyPath: "identity" });
        }
        if (!db.objectStoreNames.contains("logs")) {
          const logs = db.createObjectStore("logs", { keyPath: "identity" });
          logs.createIndex("itemIdentity", "itemIdentity");
        }
        if (!db.objectStoreNames.contains("diary")) {
          const diary = db.createObjectStore("diary", { keyPath: "identity" });
          diary.createIndex("itemIdentity", "itemIdentity");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("userOverrides")) {
          db.createObjectStore("userOverrides");
        }
        if (!db.objectStoreNames.contains("gymLogs")) {
          db.createObjectStore("gymLogs", { keyPath: "id" });
        }
        // Old stores from before this and earlier cleanups — nothing reads
        // these anymore (old browser-import flow + old "habits"/"events"
        // container names). Safe to drop outright: this database is a
        // Supabase-backed cache, re-populated by pullFromCloud() on sign-in,
        // not the durable copy.
        for (const stale of ["imports", "habits", "events"]) {
          if (rawDb.objectStoreNames.contains(stale)) {
            rawDb.deleteObjectStore(stale);
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function getAllItems(): Promise<RawItem[]> {
  return (await getDb()).getAll("items");
}

export async function getAllLogs(): Promise<RawLog[]> {
  return (await getDb()).getAll("logs");
}

export async function getAllDiary(): Promise<RawDiaryEntry[]> {
  return (await getDb()).getAll("diary");
}

export async function putDiaryEntry(entry: RawDiaryEntry): Promise<void> {
  const db = await getDb();
  await db.put("diary", entry);
}

export async function hasAnyData(): Promise<boolean> {
  const db = await getDb();
  const count = await db.count("logs");
  return count > 0;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["items", "logs", "diary", "meta", "gymLogs", "userOverrides"], "readwrite");
  await Promise.all([
    tx.objectStore("items").clear(),
    tx.objectStore("logs").clear(),
    tx.objectStore("diary").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("gymLogs").clear(),
    tx.objectStore("userOverrides").clear(),
    tx.done,
  ]);
}

export async function getAllGymLogs(): Promise<RawGymLog[]> {
  return (await getDb()).getAll("gymLogs");
}

export async function putGymLog(log: RawGymLog): Promise<void> {
  const db = await getDb();
  await db.put("gymLogs", log);
}

export async function deleteGymLogById(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("gymLogs", id);
}

export async function getAllUserOverrides(): Promise<Record<string, OverrideEntry>> {
  const db = await getDb();
  const keys = await db.getAllKeys("userOverrides");
  const values = await db.getAll("userOverrides");
  const out: Record<string, OverrideEntry> = {};
  keys.forEach((key, i) => {
    out[key] = values[i];
  });
  return out;
}

export async function setUserOverride(key: string, entry: OverrideEntry): Promise<void> {
  const db = await getDb();
  await db.put("userOverrides", entry, key);
}

export async function putItem(item: RawItem): Promise<void> {
  const db = await getDb();
  await db.put("items", item);
}

export async function getItem(identity: string): Promise<RawItem | undefined> {
  const db = await getDb();
  return db.get("items", identity);
}

export async function putLog(log: RawLog): Promise<void> {
  const db = await getDb();
  await db.put("logs", log);
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

/** Deletes one specific log entry by its own identity — used to undo a
 * specific mistaken tap from the day's timeline, as opposed to
 * `decrementDailyLog`'s "remove any one occurrence of this item". */
export async function deleteLogById(identity: string): Promise<void> {
  const db = await getDb();
  await db.delete("logs", identity);
}

/** Corrects the meal tag on an already-logged entry — for fixing a mistake
 * after the fact, not just at the moment of logging. Leaves `updatedAt`
 * untouched so the entry keeps its original time and timeline position;
 * only the tag itself changes. */
export async function updateLogMealTag(identity: string, mealTag: string | null): Promise<void> {
  const db = await getDb();
  const log = await db.get("logs", identity);
  if (!log) return;
  await db.put("logs", { ...log, mealTag });
}

/**
 * Logs or unlogs an item for a given day, from the Log page. Treats
 * "logged today" as a single fact regardless of where the underlying log
 * row came from: if any log already exists for this item on this date
 * (historical or previously logged), tapping clears all of them; otherwise
 * it writes one new log. This keeps a chip's checked state accurate even
 * for days that were already tracked in the historical data.
 *
 * Returns the new logged state (true = now logged).
 */
export async function toggleDailyLog(itemIdentity: string, date: string): Promise<boolean> {
  const db = await getDb();
  const tx = db.transaction("logs", "readwrite");
  const existing = await tx.store.index("itemIdentity").getAll(itemIdentity);
  const sameDay = existing.filter((l) => l.date === date);

  if (sameDay.length > 0) {
    await Promise.all(sameDay.map((l) => tx.store.delete(l.identity)));
    await tx.done;
    return false;
  }

  const log: RawLog = {
    identity: `manual:${itemIdentity}:${date}:${Date.now()}`,
    itemIdentity,
    date,
    value: 1,
    goalValue: null,
    isSkipped: false,
    updatedAt: Date.now(),
    mealTag: null,
  };
  await tx.store.put(log);
  await tx.done;
  return true;
}

/**
 * Adds one more occurrence of an item on a day (e.g. a second banana),
 * as a new log row — matches how the rest of the app already counts
 * occurrences (one row = one time), so no aggregation code needs to know
 * about a "count" field. `mealTag` is set from the Log page's meal
 * selector, not derived from `updatedAt` — logging breakfast at night
 * still tags it as breakfast.
 */
export async function incrementDailyLog(itemIdentity: string, date: string, mealTag: string | null = null): Promise<void> {
  const db = await getDb();
  const log: RawLog = {
    identity: `manual:${itemIdentity}:${date}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    itemIdentity,
    date,
    value: 1,
    goalValue: null,
    isSkipped: false,
    updatedAt: Date.now(),
    mealTag,
  };
  await db.put("logs", log);
}

/**
 * Removes one occurrence of an item on a day. Prefers deleting a
 * manually-logged row over a historical one, so undoing an accidental
 * extra tap never touches imported history. Returns false if there was
 * nothing left to remove.
 */
export async function decrementDailyLog(itemIdentity: string, date: string): Promise<boolean> {
  const db = await getDb();
  const tx = db.transaction("logs", "readwrite");
  const sameDay = (await tx.store.index("itemIdentity").getAll(itemIdentity)).filter((l) => l.date === date);
  if (sameDay.length === 0) {
    await tx.done;
    return false;
  }
  const target = sameDay.find((l) => l.identity.startsWith("manual:")) ?? sameDay[0];
  await tx.store.delete(target.identity);
  await tx.done;
  return true;
}
