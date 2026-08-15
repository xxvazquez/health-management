import JSZip from "jszip";
import { detectFileKind } from "./detectFile";
import { extractHabitDb, UnrecognizedSchemaError } from "./extractHabitDb";
import { openSqliteDatabase } from "@/lib/sqljs";
import type { ImportFileReport, RawHabit, RawEvent, RawDiaryEntry } from "@/lib/types";

export interface InputFile {
  path: string;
  data: Uint8Array;
}

const MAX_ZIP_DEPTH = 3;

async function expandZip(file: InputFile, depth: number): Promise<InputFile[]> {
  if (depth > MAX_ZIP_DEPTH) return [file];
  const zip = await JSZip.loadAsync(file.data);
  const out: InputFile[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const data = await entry.async("uint8array");
    const path = `${file.path}/${entry.name}`;
    const kind = detectFileKind(data, entry.name);
    if (kind === "zip") {
      out.push(...(await expandZip({ path, data }, depth + 1)));
    } else {
      out.push({ path, data });
    }
  }
  return out;
}

/** Expands any ZIP files in the input list in place; everything else passes through. */
export async function flattenInputFiles(files: InputFile[]): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const file of files) {
    const kind = detectFileKind(file.data, file.path);
    if (kind === "zip") {
      out.push(...(await expandZip(file, 1)));
    } else {
      out.push(file);
    }
  }
  return out;
}

export interface ImportPipelineResult {
  habits: RawHabit[];
  events: RawEvent[];
  diary: RawDiaryEntry[];
  fileReports: ImportFileReport[];
}

/**
 * Runs the whole client-side import pipeline over a flat list of files
 * (already expanded from any ZIPs). Recognizes SQLite Habit-tracker
 * exports; everything else is reported, never silently dropped.
 */
export async function runImportPipeline(files: InputFile[]): Promise<ImportPipelineResult> {
  const flat = await flattenInputFiles(files);

  const habits: RawHabit[] = [];
  const events: RawEvent[] = [];
  const diary: RawDiaryEntry[] = [];
  const fileReports: ImportFileReport[] = [];

  for (const file of flat) {
    const kind = detectFileKind(file.data, file.path);
    const base: Omit<ImportFileReport, "status" | "detail"> = {
      path: file.path,
      kind,
      sizeBytes: file.data.byteLength,
    };

    if (kind === "sqlite") {
      try {
        const db = await openSqliteDatabase(file.data);
        try {
          const extracted = extractHabitDb(db);
          habits.push(...extracted.habits);
          events.push(...extracted.events);
          diary.push(...extracted.diary);
          fileReports.push({
            ...base,
            status: "parsed",
            detail: `${extracted.habits.length} habits, ${extracted.events.length} tracked days, ${extracted.diary.length} notes`,
          });
        } finally {
          db.close();
        }
      } catch (err) {
        if (err instanceof UnrecognizedSchemaError) {
          fileReports.push({ ...base, status: "skipped-unrecognized", detail: err.message });
        } else {
          fileReports.push({
            ...base,
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else if (kind === "plist") {
      fileReports.push({
        ...base,
        status: "skipped-not-relevant",
        detail: "App settings/preferences file — not tracking data, not imported.",
      });
    } else if (kind === "log") {
      fileReports.push({
        ...base,
        status: "skipped-not-relevant",
        detail: "App debug/sync log — not tracking data, not imported.",
      });
    } else {
      fileReports.push({
        ...base,
        status: "skipped-unrecognized",
        detail: "Unrecognized file type.",
      });
    }
  }

  return { habits, events, diary, fileReports };
}
