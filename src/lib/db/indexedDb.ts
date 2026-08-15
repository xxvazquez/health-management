import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RawHabit, RawEvent, RawDiaryEntry, ImportFileReport } from "@/lib/types";

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
}

const DB_NAME = "health-analytics";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HealthDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<HealthDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<HealthDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("habits", { keyPath: "identity" });
        const events = db.createObjectStore("events", { keyPath: "identity" });
        events.createIndex("habitIdentity", "habitIdentity");
        const diary = db.createObjectStore("diary", { keyPath: "identity" });
        diary.createIndex("habitIdentity", "habitIdentity");
        db.createObjectStore("imports", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("meta");
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
