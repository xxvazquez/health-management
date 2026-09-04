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

/** Hands the bundle to the browser as a downloaded .json file. */
export function downloadExport(bundle: ExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lauva-export-${bundle.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
