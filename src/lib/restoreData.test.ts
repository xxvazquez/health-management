import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BackupFileError, parseBackup } from "./restoreData";
import { RESTORE_ORDER } from "./exportData";

const ME = "11111111-1111-1111-1111-111111111111";
const PARTNER = "22222222-2222-2222-2222-222222222222";

function backup(tables: Record<string, unknown[]>, userId = ME): string {
  return JSON.stringify({ exportedAt: "2026-10-01T10:00:00.000Z", userId, tables, totalRows: 0 });
}

describe("parseBackup", () => {
  it("rejects files that aren't an export", () => {
    expect(() => parseBackup("not json", ME)).toThrow(BackupFileError);
    expect(() => parseBackup("{}", ME)).toThrow(BackupFileError);
  });

  it("rejects another account's backup", () => {
    expect(() => parseBackup(backup({}, PARTNER), ME)).toThrow("different account");
  });

  it("keeps only owned rows of known tables and strips generated columns", () => {
    const plan = parseBackup(
      backup({
        food_items: [
          { id: "a", user_id: ME, name: "Apple", name_key: "apple" },
          { id: "b", user_id: PARTNER, name: "Pear" },
        ],
        notes: [
          { id: "n1", sender_id: ME, recipient_id: PARTNER, created_at: "2026-02-01" },
          { id: "n2", sender_id: PARTNER, recipient_id: ME, created_at: "2026-01-01" },
        ],
        household_tasks: [{ id: "t1", owner_id: ME }],
        household_task_subitems: [
          { id: "s1", task_id: "t1" },
          { id: "s2", task_id: "other" },
        ],
        not_a_table: [{ id: "x", user_id: ME }],
      }),
      ME,
    );
    const byTable = Object.fromEntries(plan.tables.map((t) => [t.table, t.rows]));
    expect(byTable.food_items).toEqual([{ id: "a", user_id: ME, name: "Apple" }]);
    expect(byTable.notes.map((r) => r.id)).toEqual(["n1"]);
    expect(byTable.household_task_subitems.map((r) => r.id)).toEqual(["s1"]);
    expect(byTable.not_a_table).toBeUndefined();
    expect(plan.totalRows).toBe(4);
  });

  it("orders rows oldest first", () => {
    const plan = parseBackup(
      backup({ journal_entries: [
        { id: "2", user_id: ME, created_at: "2026-03-01" },
        { id: "1", user_id: ME, created_at: "2026-01-01" },
      ] }),
      ME,
    );
    expect(plan.tables[0].rows.map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("RESTORE_ORDER", () => {
  it("puts every referenced table before the tables that point at it", () => {
    const schema = readFileSync(join(__dirname, "../../supabase/schema.sql"), "utf8");
    for (const [i, table] of RESTORE_ORDER.entries()) {
      const block = schema.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))![1];
      for (const [, ref] of block.matchAll(/references public\.([a-z_]+)/g)) {
        if (ref === table || !RESTORE_ORDER.includes(ref)) continue;
        expect(RESTORE_ORDER.indexOf(ref), `${table} -> ${ref}`).toBeLessThan(i);
      }
    }
  });
});
