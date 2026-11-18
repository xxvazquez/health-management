// Emails the account owner a zipped JSON export of their data — the same
// bundle as Settings → Your data, with the table list read straight from
// src/lib/exportData.ts so the two never drift apart. Runs from
// weekly-export.yml. Nothing is written to the job log beyond row counts.
//
// Usage: node weekly-export.mjs            builds and emails the export
//        node weekly-export.mjs --dry-run  prints the SQL it would run
// Env:   DB_URL          Postgres connection string (the backup's Session pooler URL)
//        EXPORT_EMAIL    the account's email address; also where it's sent
//        RESEND_API_KEY  Resend key, as used by the reminder emails
//        EXPORT_FROM     optional sender, e.g. "Lauva <export@your-domain>"

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXPORT_SOURCE = new URL("../../src/lib/exportData.ts", import.meta.url);

/** The `{ table, owner }` pairs from exportData.ts's TABLES list. */
function exportedTables() {
  const source = readFileSync(EXPORT_SOURCE, "utf8");
  const pairs = [...source.matchAll(/\{\s*table:\s*"([a-z_]+)",\s*owner:\s*"([a-z_]+)"\s*\}/g)].map(([, table, owner]) => ({ table, owner }));
  if (pairs.length < 10) throw new Error("Couldn't read the table list from exportData.ts.");
  return pairs;
}

/** One query returning every table as a JSON array, keyed by table name. */
function exportSql(tables) {
  const parts = tables.map(
    ({ table, owner }) => `'${table}', (select coalesce(json_agg(t), '[]') from public.${table} t where t.${owner} = :'uid')`,
  );
  parts.push(`'notes', (select coalesce(json_agg(t), '[]') from public.notes t where t.sender_id = :'uid' or t.recipient_id = :'uid')`);
  parts.push(
    `'household_task_subitems', (select coalesce(json_agg(t), '[]') from public.household_task_subitems t where t.task_id in (select id from public.household_tasks where owner_id = :'uid'))`,
  );
  // A Postgres function takes at most 100 arguments, so the object is built
  // in chunks of 40 tables and merged.
  const chunks = [];
  for (let i = 0; i < parts.length; i += 40) chunks.push(`jsonb_build_object(\n  ${parts.slice(i, i + 40).join(",\n  ")}\n)`);
  return `select ${chunks.join("\n|| ")};\n`;
}

function psql(dbUrl, sql, vars) {
  const dir = mkdtempSync(join(tmpdir(), "lauva-export-"));
  const file = join(dir, "query.sql");
  writeFileSync(file, sql);
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]), "-f", file, dbUrl];
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 }).trim();
}

async function main() {
  const tables = exportedTables();
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(exportSql(tables));
    return;
  }

  const { DB_URL, EXPORT_EMAIL, RESEND_API_KEY, EXPORT_FROM } = process.env;
  if (!DB_URL || !EXPORT_EMAIL || !RESEND_API_KEY) throw new Error("DB_URL, EXPORT_EMAIL and RESEND_API_KEY must all be set.");

  const userId = psql(DB_URL, "select id from auth.users where lower(email) = lower(:'email');\n", { email: EXPORT_EMAIL });
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error("No account found for EXPORT_EMAIL.");

  const data = JSON.parse(psql(DB_URL, exportSql(tables), { uid: userId }));
  const totalRows = Object.values(data).reduce((n, rows) => n + rows.length, 0);
  const exportedAt = new Date().toISOString();
  const bundle = { exportedAt, userId, tables: data, totalRows };

  const date = exportedAt.slice(0, 10);
  const dir = mkdtempSync(join(tmpdir(), "lauva-export-"));
  const jsonName = `lauva-export-${date}.json`;
  const zipName = `lauva-export-${date}.zip`;
  writeFileSync(join(dir, jsonName), JSON.stringify(bundle, null, 2));
  execFileSync("zip", ["-q", "-9", zipName, jsonName], { cwd: dir });
  const zip = readFileSync(join(dir, zipName));

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EXPORT_FROM || "Lauva <onboarding@resend.dev>",
      to: [EXPORT_EMAIL],
      subject: `Your Lauva data · ${date}`,
      text: `Your weekly Lauva export is attached: ${totalRows} records as JSON, the same as Settings → Your data.`,
      attachments: [{ filename: zipName, content: zip.toString("base64") }],
    }),
  });
  if (!res.ok) throw new Error(`Sending the email failed: ${res.status} ${await res.text()}`);
  console.log(`Sent ${totalRows} records across ${Object.keys(data).length} tables (${Math.round(zip.length / 1024)} KB zipped).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
