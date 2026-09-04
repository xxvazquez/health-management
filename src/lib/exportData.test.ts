import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildExport, EXPORT_SECTIONS, rowsToCsv } from "./exportData";

// The TABLES list is module-private; reach it through the module source so
// the test guards the actual data without exporting internals.
const source = readFileSync(join(__dirname, "exportData.ts"), "utf8");
const entries = [...source.matchAll(/\{ table: "([a-z_]+)", owner: "([a-z_]+)" \}/g)].map((m) => ({
  table: m[1],
  owner: m[2],
}));

const schema = readFileSync(join(__dirname, "../../supabase/schema.sql"), "utf8");

describe("export table list", () => {
  it("has entries and no duplicates", () => {
    expect(entries.length).toBeGreaterThan(30);
    expect(new Set(entries.map((e) => e.table)).size).toBe(entries.length);
  });

  it("names a real table and a column that table actually has", () => {
    for (const { table, owner } of entries) {
      const block = schema.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
      expect(block, `table ${table} missing from schema.sql`).toBeTruthy();
      expect(block![1], `${table} has no ${owner} column`).toContain(`${owner} uuid`);
    }
  });

  it("only scopes rows by an ownership column", () => {
    for (const { owner } of entries) {
      expect(["user_id", "owner_id", "completed_by"]).toContain(owner);
    }
  });
});

describe("EXPORT_SECTIONS", () => {
  it("covers every export table exactly once", () => {
    const sectioned = EXPORT_SECTIONS.flatMap((s) => s.tables);
    expect(new Set(sectioned).size).toBe(sectioned.length);
    expect([...sectioned].sort()).toEqual([...entries.map((e) => e.table)].sort());
  });
});

describe("rowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("unions keys across rows and quotes cells that need it", () => {
    const csv = rowsToCsv([
      { a: 1, b: "x" },
      { a: 2, c: 'has "quote", comma' },
    ]);
    const [header, r1, r2] = csv.trimEnd().split("\n");
    expect(header).toBe("a,b,c");
    expect(r1).toBe("1,x,");
    expect(r2).toBe('2,,"has ""quote"", comma"');
  });
});

describe("buildExport", () => {
  it("returns an empty bundle when Supabase isn't configured", async () => {
    const bundle = await buildExport("00000000-0000-0000-0000-000000000000");
    expect(bundle.totalRows).toBe(0);
    expect(Object.keys(bundle.tables).length).toBe(entries.length);
  });
});
