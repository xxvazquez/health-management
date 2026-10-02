"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useData } from "@/lib/DataContext";
import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote, RowMenu } from "@/components/manage/ManageSection";
import { FormGroup } from "@/components/ui/FormGroup";
import { Sheet } from "@/components/ui/Sheet";
import { buildExport, downloadExport, downloadSectionCsv, EXPORT_SECTIONS, type ExportBundle } from "@/lib/exportData";
import { BackupFileError, parseBackup, restoreBackup, type RestorePlan } from "@/lib/restoreData";

/** "Your data" — a one-click JSON backup of everything the signed-in
 * account owns, a way to restore one, plus a per-section CSV picker.
 * Hidden in demo mode: there's nothing real to export. */
export function DataExportCard({ isDemoData }: { isDemoData: boolean }) {
  const { session } = useAuth();
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [json, setJson] = useState<"idle" | "working" | "error">("idle");
  const [csv, setCsv] = useState<"idle" | "working" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [sectionLabel, setSectionLabel] = useState(EXPORT_SECTIONS[0].label);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isDemoData || !session) return null;

  const busy = json === "working" || csv === "working";

  async function pickBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNote(null);
    setRestoreError(null);
    try {
      const plan = parseBackup(await file.text(), session!.user.id);
      if (plan.totalRows === 0) setRestoreError("This backup has nothing to restore.");
      else setRestorePlan(plan);
    } catch (err) {
      setRestoreError(err instanceof BackupFileError ? err.message : "Couldn't read that file.");
    }
  }

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
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={rowCls} style={{ color: "var(--ui-accent)" }}>
          Restore from a backup
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={pickBackup} />
      </div>
      <GroupNote>A full backup in one file. Restoring adds back what&apos;s missing and never changes or deletes anything.</GroupNote>
      {restoreError && (
        <p className="px-4 text-xs" style={{ color: "var(--status-critical)" }}>
          {restoreError}
        </p>
      )}

      <div className={`${GROUP_CLS} mt-3`} style={GROUP_STYLE}>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
          <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
            Section
          </span>
          <RowMenu
            value={sectionLabel}
            onChange={setSectionLabel}
            disabled={busy}
            ariaLabel="Section to export as CSV"
            options={EXPORT_SECTIONS.map((s) => ({ value: s.label, label: s.label }))}
          />
        </div>
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
      {restorePlan && (
        <RestoreSheet
          plan={restorePlan}
          onClose={() => setRestorePlan(null)}
          onDone={(message) => {
            setRestorePlan(null);
            setNote(message);
          }}
        />
      )}
    </CollapsibleManageCard>
  );
}

/** Shows what a backup holds, per section, and restores it on confirm. */
function RestoreSheet({ plan, onClose, onDone }: { plan: RestorePlan; onClose: () => void; onDone: (message: string) => void }) {
  const titleId = useId();
  const { syncNow } = useData();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const counts = new Map(plan.tables.map((t) => [t.table, t.rows.length]));
  const sections = EXPORT_SECTIONS.filter((s) => s.label !== "Everything")
    .map((s) => ({ label: s.label, rows: s.tables.reduce((n, t) => n + (counts.get(t) ?? 0), 0) }))
    .filter((s) => s.rows > 0);
  const date = new Date(plan.exportedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  async function restore(e: FormEvent) {
    e.preventDefault();
    if (progress !== null) return;
    setProgress(0);
    setError(false);
    try {
      const result = await restoreBackup(plan, setProgress);
      await syncNow();
      if (result.added === 0 && result.failed === 0) {
        onDone("Everything in this backup is already here.");
        return;
      }
      const parts = [`Restored ${result.added.toLocaleString()} rows`];
      if (result.existing) parts.push(`${result.existing.toLocaleString()} were already here`);
      if (result.failed) parts.push(`${result.failed.toLocaleString()} clashed with current data and were skipped`);
      onDone(`${parts.join("; ")}.`);
    } catch (err) {
      console.error("restore failed", err);
      setError(true);
      setProgress(null);
    }
  }

  const busyLabel = progress === null ? "Restoring…" : `${Math.round((progress / plan.totalRows) * 100)}%`;

  return (
    <Sheet
      title="Restore backup"
      titleId={titleId}
      onClose={onClose}
      form={{ onSubmit: restore, submitLabel: "Restore", busy: progress !== null, busyLabel }}
    >
      <FormGroup
        title={`Backup from ${date}`}
        footer="Only rows missing from your account are added. Nothing you have now is changed or deleted."
      >
        {sections.map((s) => (
          <div key={s.label} className="flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm">
            <span style={{ color: "var(--text-primary)" }}>{s.label}</span>
            <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
              {s.rows.toLocaleString()}
            </span>
          </div>
        ))}
      </FormGroup>
      {error && (
        <p className="mt-3 px-4 text-xs" style={{ color: "var(--status-critical)" }}>
          The restore stopped partway — check your connection and try again. Rows already restored stay.
        </p>
      )}
    </Sheet>
  );
}
