import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { withBasePath } from "./basePath";

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      // sql.js's own build picks between a couple of differently-named wasm
      // binaries (sql-wasm.wasm / sql-wasm-browser.wasm) depending on how
      // it gets bundled — they're the same binary, so always serve the one
      // copy we publish (see the sync-wasm npm script) regardless of which
      // name the glue code asks for.
      locateFile: () => withBasePath("/sql-wasm.wasm"),
    });
  }
  return sqlJsPromise;
}

export async function openSqliteDatabase(bytes: Uint8Array): Promise<Database> {
  const SQL = await getSqlJs();
  return new SQL.Database(bytes);
}

/** Runs a SELECT and returns rows as plain objects keyed by column name. */
export function queryAll<T = Record<string, unknown>>(db: Database, sql: string): T[] {
  const result = db.exec(sql);
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as T;
  });
}

export function tableExists(db: Database, tableName: string): boolean {
  const rows = queryAll<{ name: string }>(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
  );
  return rows.length > 0;
}
