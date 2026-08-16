import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RawHabit, RawEvent, RawDiaryEntry, ImportFileReport } from "@/lib/types";
import type { OverrideEntry } from "@/taxonomy/classify";

export interface StoredImportLog {
  id?: number;
  importedAt: string;
  fileReports: ImportFileReport[];
  habitsSeen: number;
  eventsSeen: number;
  eventsNew: number;
  eventsUpdated: number;
  eventsUnchanged: number;
  diarySeen: number;
}

interface HealthDbSchema extends DBSchema {
  habits: { key: string; value: RawHabit };
  events: { key: string; value: RawEvent; indexes: { habitIdentity: string } };
  diary: { key: string; value: RawDiaryEntry; indexes: { habitIdentity: string } };
  imports: { key: number; value: StoredImportLog };
  meta: { key: string; value: unknown };
  // Keyed by the same normalized-name key as taxonomy/overrides.json, so an
  // item logged directly (never seen in an import) still classifies
  // correctly wherever it's rendered.
  userOverrides: { key: string; value: OverrideEntry };
}

const DB_NAME = "health-analytics";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<HealthDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<HealthDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<HealthDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("habits")) {
          db.createObjectStore("habits", { keyPath: "identity" });
        }
        if (!db.objectStoreNames.contains("events")) {
          const events = db.createObjectStore("events", { keyPath: "identity" });
          events.createIndex("habitIdentity", "habitIdentity");
        }
        if (!db.objectStoreNames.contains("diary")) {
          const diary = db.createObjectStore("diary", { keyPath: "identity" });
          diary.createIndex("habitIdentity", "habitIdentity");
        }
        if (!db.objectStoreNames.contains("imports")) {
          db.createObjectStore("imports", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("userOverrides")) {
          db.createObjectStore("userOverrides");
        }
      },
    });
  }
  return dbPromise;
}

export async function getAllHabits(): Promise<RawHabit[]> {
  return (await getDb()).getAll("habits");
}

export async function getAllEvents(): Promise<RawEvent[]> {
  return (await getDb()).getAll("events");
}

export async function getAllDiary(): Promise<RawDiaryEntry[]> {
  return (await getDb()).getAll("diary");
}

export async function getImportLogs(): Promise<StoredImportLog[]> {
  const logs = await (await getDb()).getAll("imports");
  return logs.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function hasAnyData(): Promise<boolean> {
  const db = await getDb();
  const count = await db.count("events");
  return count > 0;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["habits", "events", "diary", "imports", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("habits").clear(),
    tx.objectStore("events").clear(),
    tx.objectStore("diary").clear(),
    tx.objectStore("imports").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}

export interface MergeCounts {
  eventsNew: number;
  eventsUpdated: number;
  eventsUnchanged: number;
}

function isNewer(incoming: RawEvent, existing: RawEvent): boolean {
  if (incoming.updatedAt == null) return false;
  if (existing.updatedAt == null) return true;
  return incoming.updatedAt > existing.updatedAt;
}

function eventEquals(a: RawEvent, b: RawEvent): boolean {
  return a.value === b.value && a.goalValue === b.goalValue && a.isSkipped === b.isSkipped;
}

/**
 * Upserts habits/events/diary keyed by their stable Core Data identity.
 * Events only get overwritten when the incoming row is demonstrably newer
 * (by ZUPDATEDATE) or the existing row has no timestamp yet — so importing
 * an older export after a newer one can't regress data, and re-importing
 * the same export is a no-op. Returns counts for the import report.
 */
export async function mergeImportedData(
  habits: RawHabit[],
  events: RawEvent[],
  diary: RawDiaryEntry[],
): Promise<MergeCounts> {
  const db = await getDb();

  const existingEvents = new Map((await db.getAll("events")).map((e) => [e.identity, e]));

  let eventsNew = 0;
  let eventsUpdated = 0;
  let eventsUnchanged = 0;
  const eventsToWrite: RawEvent[] = [];

  for (const incoming of events) {
    const existing = existingEvents.get(incoming.identity);
    if (!existing) {
      eventsNew++;
      eventsToWrite.push(incoming);
    } else if (eventEquals(incoming, existing)) {
      eventsUnchanged++;
    } else if (isNewer(incoming, existing)) {
      eventsUpdated++;
      eventsToWrite.push(incoming);
    } else {
      eventsUnchanged++;
    }
  }

  const tx = db.transaction(["habits", "events", "diary"], "readwrite");
  const habitsStore = tx.objectStore("habits");
  const eventsStore = tx.objectStore("events");
  const diaryStore = tx.objectStore("diary");

  await Promise.all([
    ...habits.map((h) => habitsStore.put(h)),
    ...eventsToWrite.map((e) => eventsStore.put(e)),
    ...diary.map((d) => diaryStore.put(d)),
    tx.done,
  ]);

  return { eventsNew, eventsUpdated, eventsUnchanged };
}

export async function addImportLog(log: StoredImportLog): Promise<void> {
  const db = await getDb();
  await db.add("imports", log);
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

export async function putHabit(habit: RawHabit): Promise<void> {
  const db = await getDb();
  await db.put("habits", habit);
}

export async function getHabit(identity: string): Promise<RawHabit | undefined> {
  const db = await getDb();
  return db.get("habits", identity);
}

export async function putEvent(event: RawEvent): Promise<void> {
  const db = await getDb();
  await db.put("events", event);
}

export async function getEventsForHabitOnDate(habitIdentity: string, date: string): Promise<RawEvent[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("events", "habitIdentity", habitIdentity);
  return all.filter((e) => e.date === date);
}

/**
 * Logs or unlogs an item for a given day, from the Log page rather than an
 * import. Treats "logged today" as a single fact regardless of where the
 * underlying event row came from: if any event already exists for this
 * habit on this date (imported or previously logged), tapping clears all of
 * them; otherwise it writes one new event. This keeps a chip's checked
 * state accurate even for days that were already tracked via the old
 * habit-tracker import.
 *
 * Returns the new logged state (true = now logged).
 */
export async function toggleDailyLog(habitIdentity: string, date: string): Promise<boolean> {
  const db = await getDb();
  const tx = db.transaction("events", "readwrite");
  const existing = await tx.store.index("habitIdentity").getAll(habitIdentity);
  const sameDay = existing.filter((e) => e.date === date);

  if (sameDay.length > 0) {
    await Promise.all(sameDay.map((e) => tx.store.delete(e.identity)));
    await tx.done;
    return false;
  }

  const event: RawEvent = {
    identity: `manual:${habitIdentity}:${date}:${Date.now()}`,
    habitIdentity,
    date,
    value: 1,
    goalValue: null,
    isSkipped: false,
    updatedAt: Date.now(),
  };
  await tx.store.put(event);
  await tx.done;
  return true;
}

/**
 * Adds one more occurrence of an item on a day (e.g. a second banana),
 * as a new event row — matches how the rest of the app already counts
 * occurrences (one row = one time), so no aggregation code needs to know
 * about a "count" field.
 */
export async function incrementDailyLog(habitIdentity: string, date: string): Promise<void> {
  const db = await getDb();
  const event: RawEvent = {
    identity: `manual:${habitIdentity}:${date}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    habitIdentity,
    date,
    value: 1,
    goalValue: null,
    isSkipped: false,
    updatedAt: Date.now(),
  };
  await db.put("events", event);
}

/**
 * Removes one occurrence of an item on a day. Prefers deleting a
 * manually-logged row over an imported one, so undoing an accidental extra
 * tap never touches history that came from the old habit-tracker export.
 * Returns false if there was nothing left to remove.
 */
export async function decrementDailyLog(habitIdentity: string, date: string): Promise<boolean> {
  const db = await getDb();
  const tx = db.transaction("events", "readwrite");
  const sameDay = (await tx.store.index("habitIdentity").getAll(habitIdentity)).filter((e) => e.date === date);
  if (sameDay.length === 0) {
    await tx.done;
    return false;
  }
  const target = sameDay.find((e) => e.identity.startsWith("manual:")) ?? sameDay[0];
  await tx.store.delete(target.identity);
  await tx.done;
  return true;
}
