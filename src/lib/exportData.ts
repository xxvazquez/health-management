import { supabase } from "@/lib/supabase/client";

const PAGE = 1000;

/** Every table the export reads, with the column that scopes a row to the
 * signed-in user. The filter is applied explicitly rather than trusting
 * row-level security alone — same defence as sync.ts's `fetchAllRows`: RLS
 * is the real boundary, but a table whose policy is ever missing or
 * mis-scoped on the live project would otherwise hand this export another
 * account's rows. Messages (`notes`) are two-party and left out of a
 * one-sided "your data" export for now. */
const TABLES: { table: string; owner: string }[] = [
  { table: "categories", owner: "user_id" },
  { table: "food_items", owner: "user_id" },
  { table: "supplement_items", owner: "user_id" },
  { table: "symptom_items", owner: "user_id" },
  { table: "habit_items", owner: "user_id" },
  { table: "workout_items", owner: "user_id" },
  { table: "food_logs", owner: "user_id" },
  { table: "supplement_logs", owner: "user_id" },
  { table: "symptom_logs", owner: "user_id" },
  { table: "habit_logs", owner: "user_id" },
  { table: "workout_logs", owner: "user_id" },
  { table: "food_diary", owner: "user_id" },
  { table: "supplement_diary", owner: "user_id" },
  { table: "symptom_diary", owner: "user_id" },
  { table: "habit_diary", owner: "user_id" },
  { table: "workout_diary", owner: "user_id" },
  { table: "stool_logs", owner: "user_id" },
  { table: "period_logs", owner: "user_id" },
  { table: "journal_entries", owner: "user_id" },
  { table: "personal_notes", owner: "user_id" },
  { table: "personal_items", owner: "user_id" },
  { table: "reminder_lists", owner: "user_id" },
  { table: "personal_tasks", owner: "user_id" },
  { table: "personal_task_completions", owner: "user_id" },
  { table: "doctor_specialties", owner: "user_id" },
  { table: "doctors", owner: "user_id" },
  { table: "doctor_appointments", owner: "user_id" },
  { table: "doctor_appointment_tasks", owner: "user_id" },
  { table: "care_entries", owner: "user_id" },
  { table: "care_entry_specialties", owner: "user_id" },
  { table: "lab_panels", owner: "user_id" },
  { table: "lab_markers", owner: "user_id" },
  { table: "lab_results", owner: "user_id" },
  { table: "blood_pressure", owner: "user_id" },
  { table: "weight_logs", owner: "user_id" },
  { table: "wishlist_categories", owner: "owner_id" },
  { table: "wishlist_items", owner: "owner_id" },
  { table: "household_notes", owner: "owner_id" },
  { table: "household_tasks", owner: "owner_id" },
  { table: "household_task_completions", owner: "completed_by" },
  { table: "household_items", owner: "owner_id" },
  { table: "household_codes", owner: "owner_id" },
];

/** The same tables grouped into the sections the app presents, for the
 * per-section CSV picker. Every table in `TABLES` appears exactly once
 * here (guarded by a test). */
export const EXPORT_SECTIONS: { label: string; tables: string[] }[] = [
  { label: "Food", tables: ["food_items", "food_logs", "food_diary"] },
  { label: "Symptoms", tables: ["symptom_items", "symptom_logs", "symptom_diary"] },
  { label: "Supplements", tables: ["supplement_items", "supplement_logs", "supplement_diary"] },
  { label: "Habits", tables: ["habit_items", "habit_logs", "habit_diary"] },
  { label: "Workout", tables: ["workout_items", "workout_logs", "workout_diary"] },
  { label: "Stool", tables: ["stool_logs"] },
  { label: "Cycle", tables: ["period_logs"] },
  { label: "Categories", tables: ["categories"] },
  { label: "Journal", tables: ["journal_entries"] },
  {
    label: "Personal notes & reminders",
    tables: ["personal_notes", "reminder_lists", "personal_tasks", "personal_task_completions", "personal_items"],
  },
  {
    label: "Medical",
    tables: ["doctor_specialties", "doctors", "doctor_appointments", "doctor_appointment_tasks", "care_entries", "care_entry_specialties"],
  },
  { label: "Labs", tables: ["lab_panels", "lab_markers", "lab_results"] },
  { label: "Vitals", tables: ["blood_pressure", "weight_logs"] },
  { label: "Wishlist", tables: ["wishlist_categories", "wishlist_items"] },
  {
    label: "Household",
    tables: ["household_notes", "household_tasks", "household_task_completions", "household_items", "household_codes"],
  },
];

async function fetchAll(table: string, owner: string, userId: string): Promise<unknown[]> {
  if (!supabase) return [];
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").eq(owner, userId).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export interface ExportBundle {
  exportedAt: string;
  userId: string;
  tables: Record<string, unknown[]>;
  totalRows: number;
}

/** Pulls every owned row across the schema into one bundle. Tables are
 * read one after another to keep the request rate gentle. */
export async function buildExport(userId: string): Promise<ExportBundle> {
  const tables: Record<string, unknown[]> = {};
  let totalRows = 0;
  for (const { table, owner } of TABLES) {
    const rows = await fetchAll(table, owner, userId);
    tables[table] = rows;
    totalRows += rows.length;
  }
  return { exportedAt: new Date().toISOString(), userId, tables, totalRows };
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hands the whole bundle to the browser as a downloaded .json file. */
export function downloadExport(bundle: ExportBundle): void {
  triggerDownload(
    `lauva-export-${bundle.exportedAt.slice(0, 10)}.json`,
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
  );
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flattens a table's rows to CSV — header is the union of every row's
 * keys, so a nullable column that's set on only some rows still gets a
 * column. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(csvCell).join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvCell(row[c])).join(","));
  return lines.join("\n") + "\n";
}

/** Downloads one section's tables. A section with a single table is one
 * file; a multi-table section (Medical, Labs, …) downloads each table in
 * turn. */
export function downloadSectionCsv(bundle: ExportBundle, section: { label: string; tables: string[] }): void {
  const date = bundle.exportedAt.slice(0, 10);
  section.tables.forEach((table, i) => {
    const rows = (bundle.tables[table] ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return;
    const go = () => triggerDownload(`lauva-${table}-${date}.csv`, new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" }));
    // Stagger multi-file sections so the browser doesn't drop later downloads.
    if (i === 0) go();
    else setTimeout(go, i * 400);
  });
}
