"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FIELD_CLS, FIELD_STYLE } from "@/components/ui/formField";
import { buildExport, downloadExport, downloadSectionCsv, EXPORT_SECTIONS, type ExportBundle } from "@/lib/exportData";

/** "Your data" — a one-click JSON download of everything the signed-in
 * account owns, plus a per-section CSV picker. Hidden in demo mode:
 * there's nothing real to export. */
export function DataExportCard({ isDemoData }: { isDemoData: boolean }) {
  const { session } = useAuth();
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [json, setJson] = useState<"idle" | "working" | "error">("idle");
  const [csv, setCsv] = useState<"idle" | "working" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [sectionLabel, setSectionLabel] = useState(EXPORT_SECTIONS[0].label);

  if (isDemoData || !session) return null;

  const busy = json === "working" || csv === "working";

  async function ensureBundle(): Promise<ExportBundle> {
    if (bundle) return bundle;
    const built = await buildExport(session!.user.id);
    setBundle(built);
    return built;
  }

  async function exportJson() {
    setJson("working");
    setNote(null);
    try {
      const b = await ensureBundle();
      downloadExport(b);
      const tables = Object.values(b.tables).filter((r) => r.length > 0).length;
      setNote(`Exported ${b.totalRows.toLocaleString()} rows across ${tables} tables.`);
      setJson("idle");
    } catch (err) {
      console.error("data export failed", err);
      setJson("error");
    }
  }

  async function exportCsv() {
    setCsv("working");
    setNote(null);
    try {
      const b = await ensureBundle();
      const section = EXPORT_SECTIONS.find((s) => s.label === sectionLabel)!;
      const files = section.tables.filter((t) => (b.tables[t] ?? []).length > 0);
      if (files.length === 0) {
        setNote(`Nothing logged in ${section.label} yet.`);
      } else {
        downloadSectionCsv(b, section);
        setNote(`${section.label}: ${files.length} CSV ${files.length === 1 ? "file" : "files"}.`);
      }
      setCsv("idle");
    } catch (err) {
      console.error("csv export failed", err);
      setCsv("error");
    }
  }

  return (
    <Card tier="supporting">
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Your data
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        Download everything this account owns — every log, note, appointment, lab result and more. JSON is
        the whole account in one file; CSV gives you one section at a time for a spreadsheet. Messages with
        your partner aren&apos;t included.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={exportJson} disabled={busy} className="transition-opacity hover:opacity-90">
          {json === "working" ? "Gathering…" : "Download JSON"}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={sectionLabel}
          onChange={(e) => setSectionLabel(e.target.value)}
          disabled={busy}
          className={FIELD_CLS}
          style={FIELD_STYLE}
          aria-label="Section to export as CSV"
        >
          {EXPORT_SECTIONS.map((s) => (
            <option key={s.label} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={busy}
          className="rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
        >
          {csv === "working" ? "Gathering…" : "Download CSV"}
        </button>
      </div>

      {note && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
      {(json === "error" || csv === "error") && (
        <p className="mt-2 text-xs" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t build the export — try again in a moment.
        </p>
      )}
    </Card>
  );
}
