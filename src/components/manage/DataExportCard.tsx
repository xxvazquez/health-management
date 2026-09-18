"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote } from "@/components/manage/ManageSection";
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
      const count = await downloadSectionCsv(b, section);
      if (count === 0) setNote(`Nothing logged in ${section.label} yet.`);
      else if (count === 1) setNote(`${section.label}: one CSV file.`);
      else setNote(`${section.label}: ${count} CSV files in one .zip.`);
      setCsv("idle");
    } catch (err) {
      console.error("csv export failed", err);
      setCsv("error");
    }
  }

  const rowCls = "flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-sm disabled:opacity-50";

  return (
    <CollapsibleManageCard title="Your data" bare>
      <div className={GROUP_CLS} style={GROUP_STYLE}>
        <button type="button" onClick={exportJson} disabled={busy} className={rowCls} style={{ color: "var(--ui-accent)" }}>
          {json === "working" ? "Gathering…" : "Download everything (JSON)"}
        </button>
      </div>
      <GroupNote>Every log, note, appointment, lab result and more that this account owns, in one file. Messages with your partner aren&apos;t included.</GroupNote>

      <div className={`${GROUP_CLS} mt-3`} style={GROUP_STYLE}>
        <label className="flex min-h-11 items-center gap-3 px-3.5">
          <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
            Section
          </span>
          <select
            value={sectionLabel}
            onChange={(e) => setSectionLabel(e.target.value)}
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm outline-none [text-align-last:right]"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Section to export as CSV"
          >
            {EXPORT_SECTIONS.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={exportCsv} disabled={busy} className={rowCls} style={{ color: "var(--ui-accent)" }}>
          {csv === "working" ? "Gathering…" : "Download section (CSV)"}
        </button>
      </div>
      <GroupNote>A single CSV file, or a .zip when the section has more than one table.</GroupNote>

      {note && <GroupNote>{note}</GroupNote>}
      {(json === "error" || csv === "error") && (
        <p className="px-4 text-xs" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t build the export — try again in a moment.
        </p>
      )}
    </CollapsibleManageCard>
  );
}
