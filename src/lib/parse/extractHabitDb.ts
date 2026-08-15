import type { Database } from "sql.js";
import { queryAll, tableExists } from "@/lib/sqljs";
import { coreDataSecondsToISODate, coreDataSecondsToTimestamp, epochDayToISODate } from "@/lib/coreData";
import type { RawHabit, RawEvent, RawDiaryEntry } from "@/lib/types";

export class UnrecognizedSchemaError extends Error {}

interface HabitRow {
  ZIDENTITY: string;
  ZNAME: string;
  ZUNIT: string | null;
  ZKINDTYPES: string | null;
  ZFREQUENCETYPES: string | null;
  ZISREMOVED: number | null;
  ZSTARTDATE: number | null;
}

interface EventRow {
  ZIDENTITY: string;
  ZHABITID: string;
  ZFORDAY: number;
  ZDIDVALUE: string | number | null;
  ZGOALVALUE: string | number | null;
  ZISSKIPPED: number | null;
  ZUPDATEDATE: number | null;
}

interface DiaryRow {
  ZIDENTITY: string;
  ZHABITID: string;
  ZFORDAY: number;
  ZCONTENT: string | null;
  ZTITLE: string | null;
  ZUPDATEDATE: number | null;
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export interface ExtractedHabitDb {
  habits: RawHabit[];
  events: RawEvent[];
  diary: RawDiaryEntry[];
}

/**
 * Extracts the tables this app understands from a parsed Habit-tracker
 * Core Data export. ZHABIT + ZDAILYCOMPLETION are required (that's the
 * habit dimension + the authoritative, full-history completion log).
 * ZCOMPLETION / ZRECORD are older/short-lived tables largely superseded by
 * ZDAILYCOMPLETION and are intentionally not read, to avoid double counting.
 */
export function extractHabitDb(db: Database): ExtractedHabitDb {
  if (!tableExists(db, "ZHABIT") || !tableExists(db, "ZDAILYCOMPLETION")) {
    throw new UnrecognizedSchemaError(
      "This SQLite file doesn't look like a Habit-tracker export (missing ZHABIT / ZDAILYCOMPLETION tables).",
    );
  }

  const habitRows = queryAll<HabitRow>(
    db,
    `SELECT ZIDENTITY, ZNAME, ZUNIT, ZKINDTYPES, ZFREQUENCETYPES, ZISREMOVED, ZSTARTDATE FROM ZHABIT`,
  );
  const habits: RawHabit[] = habitRows.map((r) => ({
    identity: r.ZIDENTITY,
    rawName: r.ZNAME,
    unit: r.ZUNIT,
    kind: r.ZKINDTYPES,
    frequency: r.ZFREQUENCETYPES,
    isRemoved: r.ZISREMOVED === 1,
    createdDate: r.ZSTARTDATE != null ? coreDataSecondsToISODate(r.ZSTARTDATE) : null,
  }));

  const eventRows = queryAll<EventRow>(
    db,
    `SELECT ZIDENTITY, ZHABITID, ZFORDAY, ZDIDVALUE, ZGOALVALUE, ZISSKIPPED, ZUPDATEDATE FROM ZDAILYCOMPLETION WHERE ZFORDAY IS NOT NULL`,
  );
  const events: RawEvent[] = eventRows.map((r) => ({
    identity: r.ZIDENTITY,
    habitIdentity: r.ZHABITID,
    date: epochDayToISODate(r.ZFORDAY),
    value: toNumber(r.ZDIDVALUE),
    goalValue: toNumber(r.ZGOALVALUE),
    isSkipped: r.ZISSKIPPED === 1,
    updatedAt: r.ZUPDATEDATE != null ? coreDataSecondsToTimestamp(r.ZUPDATEDATE) : null,
  }));

  if (tableExists(db, "ZDELETEDHABIT")) {
    const deletedRows = queryAll<{ ZHABITID: string; ZHABITNAME: string | null }>(
      db,
      `SELECT ZHABITID, ZHABITNAME FROM ZDELETEDHABIT`,
    );
    const knownIdentities = new Set(habits.map((h) => h.identity));
    for (const r of deletedRows) {
      if (!r.ZHABITNAME || knownIdentities.has(r.ZHABITID)) continue;
      habits.push({
        identity: r.ZHABITID,
        rawName: r.ZHABITNAME,
        unit: null,
        kind: null,
        frequency: null,
        isRemoved: true,
        createdDate: null,
      });
      knownIdentities.add(r.ZHABITID);
    }
  }

  let diary: RawDiaryEntry[] = [];
  if (tableExists(db, "ZDIARY")) {
    const diaryRows = queryAll<DiaryRow>(
      db,
      `SELECT ZIDENTITY, ZHABITID, ZFORDAY, ZCONTENT, ZTITLE, ZUPDATEDATE FROM ZDIARY WHERE ZFORDAY IS NOT NULL`,
    );
    diary = diaryRows.map((r) => ({
      identity: r.ZIDENTITY,
      habitIdentity: r.ZHABITID,
      date: epochDayToISODate(r.ZFORDAY),
      content: r.ZCONTENT,
      title: r.ZTITLE,
      updatedAt: r.ZUPDATEDATE != null ? coreDataSecondsToTimestamp(r.ZUPDATEDATE) : null,
    }));
  }

  return { habits, events, diary };
}
