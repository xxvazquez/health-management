"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { Card } from "@/components/ui/Card";
import { buildExport, downloadExport } from "@/lib/exportData";

/** "Your data" — a one-click JSON download of everything the signed-in
 * account owns across every table. Hidden in demo mode: there's nothing
 * real to export. Per-section CSV is a planned follow-up. */
export function DataExportCard({ isDemoData }: { isDemoData: boolean }) {
  const { session } = useAuth();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [summary, setSummary] = useState<string | null>(null);

  if (isDemoData || !session) return null;

  async function run() {
    setState("working");
    setSummary(null);
    try {
      const bundle = await buildExport(session!.user.id);
      downloadExport(bundle);
      const tableCount = Object.values(bundle.tables).filter((rows) => rows.length > 0).length;
      setSummary(`${bundle.totalRows.toLocaleString()} rows across ${tableCount} tables`);
      setState("done");
    } catch (err) {
      console.error("data export failed", err);
      setState("error");
    }
  }

  return (
    <Card tier="supporting">
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Your data
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        Download everything this account owns — every log, note, appointment, lab result and more — as
        one JSON file. Messages with your partner aren&apos;t included.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={state === "working"}
          className="rounded-md px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--series-1)" }}
        >
          {state === "working" ? "Gathering your data…" : "Download JSON"}
        </button>
        {state === "done" && summary && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Exported {summary}.
          </span>
        )}
        {state === "error" && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            Couldn&apos;t build the export — try again in a moment.
          </span>
        )}
      </div>
    </Card>
  );
}
