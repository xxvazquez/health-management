import { supabase } from "@/lib/supabase/client";
import { withSendTimeout } from "@/lib/supabase/outbox";
import { OWNER_COLUMN, RESTORE_ORDER } from "@/lib/exportData";

type Row = Record<string, unknown>;

/** Columns Postgres computes itself; inserting a value into one fails. */
const GENERATED_COLUMNS = ["name_key"];

const BATCH_SIZE = 500;

export interface RestorePlan {
  exportedAt: string;
  /** Rows to insert, per table, already in insert order. */
  tables: { table: string; rows: Row[] }[];
  totalRows: number;
}

export interface RestoreResult {
  added: number;
  existing: number;
  /** Rows the database refused, e.g. a name that now belongs to another item. */
  failed: number;
}

export class BackupFileError extends Error {}

/** Checks a Lauva JSON export and keeps only the rows this account may
 * write back: known tables, owned by `userId` (messages: ones it sent). */
export function parseBackup(text: string, userId: string): RestorePlan {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupFileError("This file isn't a Lauva backup.");
  }
  const bundle = data as { exportedAt?: unknown; userId?: unknown; tables?: unknown };
  if (!bundle || typeof bundle !== "object" || typeof bundle.tables !== "object" || bundle.tables === null || typeof bundle.exportedAt !== "string") {
    throw new BackupFileError("This file isn't a Lauva backup.");
  }
  if (bundle.userId !== userId) throw new BackupFileError("This backup belongs to a different account.");

  const source = bundle.tables as Record<string, unknown>;
  const ownedTaskIds = new Set(
    (Array.isArray(source.household_tasks) ? source.household_tasks : [])
      .filter((r): r is Row => isRow(r) && r.owner_id === userId)
      .map((r) => r.id),
  );

  const tables: RestorePlan["tables"] = [];
  let totalRows = 0;
  for (const table of RESTORE_ORDER) {
    const raw = source[table];
    if (!Array.isArray(raw)) continue;
    const rows = raw.filter(isRow).filter((row) => {
      if (table === "notes") return row.sender_id === userId;
      if (table === "household_task_subitems") return ownedTaskIds.has(row.task_id);
      return row[OWNER_COLUMN[table]] === userId;
    });
    if (rows.length === 0) continue;
    const clean = rows.map(withoutGenerated);
    // Oldest first, so a reply lands after the message it quotes.
    if (clean.every((r) => typeof r.created_at === "string")) {
      clean.sort((a, b) => (a.created_at as string).localeCompare(b.created_at as string));
    }
    tables.push({ table, rows: clean });
    totalRows += clean.length;
  }
  return { exportedAt: bundle.exportedAt, tables, totalRows };
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutGenerated(row: Row): Row {
  const copy = { ...row };
  for (const col of GENERATED_COLUMNS) delete copy[col];
  return copy;
}

/** A refusal that only affects the rows themselves (constraint or
 * permission), as opposed to the connection failing. */
function isRowError(error: { code?: string } | null): boolean {
  return !!error?.code && (error.code.startsWith("23") || error.code === "42501");
}

async function insertMissing(table: string, rows: Row[]): Promise<{ inserted: number; error: { code?: string; message?: string } | null }> {
  const client = supabase;
  if (!client) throw new Error("Not connected");
  const { data, error } = await withSendTimeout(
    Promise.resolve(client.from(table).upsert(rows, { ignoreDuplicates: true }).select()),
  );
  return { inserted: data?.length ?? 0, error };
}

/** Inserts every row that isn't in the database yet. Rows already there
 * are left exactly as they are and nothing is deleted. A batch the
 * database refuses is retried row by row so one clash doesn't block the
 * rest. A connection failure stops the restore and throws. */
export async function restoreBackup(plan: RestorePlan, onProgress?: (done: number) => void): Promise<RestoreResult> {
  const result: RestoreResult = { added: 0, existing: 0, failed: 0 };
  let done = 0;
  for (const { table, rows } of plan.tables) {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { inserted, error } = await insertMissing(table, batch);
      if (!error) {
        result.added += inserted;
        result.existing += batch.length - inserted;
      } else if (isRowError(error)) {
        for (const row of batch) {
          const single = await insertMissing(table, [row]);
          if (!single.error) {
            result.added += single.inserted;
            result.existing += 1 - single.inserted;
          } else if (isRowError(single.error)) {
            result.failed += 1;
          } else {
            throw new Error(single.error.message ?? "Restore failed");
          }
        }
      } else {
        throw new Error(error.message ?? "Restore failed");
      }
      done += batch.length;
      onProgress?.(done);
    }
  }
  return result;
}
