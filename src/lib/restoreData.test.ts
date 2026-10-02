import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BackupFileError, parseBackup, restoreBackup } from "./restoreData";
import { RESTORE_ORDER } from "./exportData";

type Row = Record<string, unknown>;

/** Stands in for Postgres `insert … on conflict (id) do nothing returning *`:
 * a row whose `name` is already taken by another id fails the whole batch
 * with a unique violation, as the real constraint would. */
const db = new Map<string, Map<string, Row>>();
let offline = false;
const fakeSupabase = {
  from(table: string) {
    return {
      upsert(rows: Row[], options: { ignoreDuplicates?: boolean }) {
        expect(options.ignoreDuplicates).toBe(true);
        return {
          async select() {
            if (offline) return { data: null, error: { message: "Failed to fetch" } };
            const stored = db.get(table) ?? new Map<string, Row>();
            const names = new Map([...stored.values()].map((r) => [r.name, r.id]));
            if (rows.some((r) => !stored.has(r.id as string) && names.has(r.name) && names.get(r.name) !== r.id)) {
              return { data: null, error: { code: "23505", message: "duplicate key value" } };
            }
            const inserted = rows.filter((r) => !stored.has(r.id as string));
            for (const r of inserted) stored.set(r.id as string, r);
            db.set(table, stored);
            return { data: inserted, error: null };
          },
        };
      },
    };
  },
};

vi.mock("@/lib/supabase/client", () => ({
  get supabase() {
    return fakeSupabase;
  },
  supabaseConfigured: true,
}));

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

describe("restoreBackup", () => {
  const items = Array.from({ length: 1200 }, (_, i) => ({ id: `f${i}`, user_id: ME, name: `Food ${i}`, name_key: `food ${i}` }));
  const logs = [{ id: "l1", user_id: ME, item_id: "f1", date: "2026-02-01" }];
  const file = backup({ food_items: items, food_logs: logs });

  function seed(table: string, rows: Row[]) {
    db.set(table, new Map(rows.map((r) => [r.id as string, r])));
  }

  beforeEach(() => {
    db.clear();
    offline = false;
  });

  it("reports every row as already there when restoring the account's own export", async () => {
    seed("food_items", items);
    seed("food_logs", logs);
    const progress: number[] = [];
    const result = await restoreBackup(parseBackup(file, ME), (done) => progress.push(done));
    expect(result).toEqual({ added: 0, existing: 1201, failed: 0 });
    expect(progress.at(-1)).toBe(1201);
    expect(db.get("food_items")!.get("f0")).toHaveProperty("name_key", "food 0");
  });

  it("adds only the missing rows and leaves current ones untouched", async () => {
    const edited = { ...items[0], name: "Renamed" };
    seed("food_items", [edited, ...items.slice(1, 600)]);
    const result = await restoreBackup(parseBackup(file, ME));
    expect(result).toEqual({ added: 601, existing: 600, failed: 0 });
    expect(db.get("food_items")!.get("f0")).toBe(edited);
    expect(db.get("food_logs")!.has("l1")).toBe(true);
  });

  it("skips a row that clashes with newer data and still restores the rest of its batch", async () => {
    seed("food_items", [{ id: "other", user_id: ME, name: "Food 5" }]);
    const result = await restoreBackup(parseBackup(file, ME));
    expect(result).toEqual({ added: 1200, existing: 0, failed: 1 });
    expect(db.get("food_items")!.has("f5")).toBe(false);
  });

  it("stops on a connection failure", async () => {
    offline = true;
    await expect(restoreBackup(parseBackup(file, ME))).rejects.toThrow("Failed to fetch");
  });
});
