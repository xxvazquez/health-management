"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "@/lib/DataContext";
import { Card, CardTitle } from "@/components/ui/Card";
import { runImportPipeline, type InputFile } from "@/lib/parse/importPipeline";
import { mergeImportedData, addImportLog, getImportLogs, type StoredImportLog } from "@/lib/db/indexedDb";
import type { ImportFileReport } from "@/lib/types";
import clsx from "clsx";

type Stage = "idle" | "reading" | "processing" | "merging" | "done" | "error";

interface RunResult {
  fileReports: ImportFileReport[];
  habitsFound: number;
  eventsFound: number;
  diaryFound: number;
  eventsNew: number;
  eventsUpdated: number;
  eventsUnchanged: number;
}

async function filesToInputFiles(files: FileList): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const file of Array.from(files)) {
    const buf = await file.arrayBuffer();
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    out.push({ path: relPath && relPath.length > 0 ? relPath : file.name, data: new Uint8Array(buf) });
  }
  return out;
}

const STATUS_LABEL: Record<ImportFileReport["status"], string> = {
  parsed: "Parsed",
  "skipped-not-relevant": "Not tracking data",
  "skipped-unrecognized": "Unrecognized",
  error: "Error",
};

const STATUS_COLOR: Record<ImportFileReport["status"], string> = {
  parsed: "var(--status-good)",
  "skipped-not-relevant": "var(--text-muted)",
  "skipped-unrecognized": "var(--status-warning)",
  error: "var(--status-critical)",
};

export default function ImportPage() {
  const { refresh, clearData, unclassifiedItems, archivedItems } = useData();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredImportLog[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "true");
      folderInputRef.current.setAttribute("directory", "true");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistory(await getImportLogs());
  }, []);

  useEffect(() => {
    // Loading import history from IndexedDB on mount — an external-system
    // read, not a React-state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory]);

  const runImport = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setStage("reading");
      setErrorMessage(null);
      setResult(null);
      try {
        const inputFiles = await filesToInputFiles(files);
        setStage("processing");
        const pipelineResult = await runImportPipeline(inputFiles);

        setStage("merging");
        const mergeCounts = await mergeImportedData(
          pipelineResult.habits,
          pipelineResult.events,
          pipelineResult.diary,
        );

        const log: StoredImportLog = {
          importedAt: new Date().toISOString(),
          fileReports: pipelineResult.fileReports,
          habitsSeen: pipelineResult.habits.length,
          eventsSeen: pipelineResult.events.length,
          diarySeen: pipelineResult.diary.length,
          ...mergeCounts,
        };
        await addImportLog(log);

        setResult({
          fileReports: pipelineResult.fileReports,
          habitsFound: pipelineResult.habits.length,
          eventsFound: pipelineResult.events.length,
          diaryFound: pipelineResult.diary.length,
          ...mergeCounts,
        });

        await refresh();
        await loadHistory();
        setStage("done");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    },
    [refresh, loadHistory],
  );

  const busy = stage === "reading" || stage === "processing" || stage === "merging";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Import your data
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-secondary)" }}>
          Everything runs in your browser. Select the export folder (or a ZIP of it) from your habit
          tracker — nothing is uploaded anywhere. Re-importing the same export is safe (duplicates are
          skipped); importing an older export after a newer one won&apos;t overwrite newer data.
        </p>
      </div>

      <Card>
        <CardTitle subtitle="Pick the whole export folder, or a single ZIP file containing it.">
          Select export
        </CardTitle>
        <div className="flex flex-wrap gap-3">
          <label
            className={clsx(
              "cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white",
              busy && "pointer-events-none opacity-60",
            )}
            style={{ background: "var(--series-1)" }}
          >
            Choose export folder
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => void runImport(e.target.files)}
            />
          </label>
          <label
            className={clsx(
              "cursor-pointer rounded-md border px-4 py-2 text-sm font-medium",
              busy && "pointer-events-none opacity-60",
            )}
            style={{ borderColor: "var(--border-hairline)", color: "var(--text-primary)" }}
          >
            Choose ZIP file
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              disabled={busy}
              onChange={(e) => void runImport(e.target.files)}
            />
          </label>
        </div>
        {busy && (
          <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {stage === "reading" && "Reading files…"}
            {stage === "processing" && "Parsing and classifying…"}
            {stage === "merging" && "Merging with existing data…"}
          </p>
        )}
        {errorMessage && (
          <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>
            {errorMessage}
          </p>
        )}
      </Card>

      {result && (
        <Card>
          <CardTitle>Import summary</CardTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat label="Habits found" value={result.habitsFound} />
            <SummaryStat label="New tracked days" value={result.eventsNew} accent="var(--status-good)" />
            <SummaryStat label="Updated" value={result.eventsUpdated} />
            <SummaryStat label="Already had (unchanged)" value={result.eventsUnchanged} />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Files
            </p>
            <ul className="flex flex-col gap-1.5">
              {result.fileReports.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span
                    className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 font-medium"
                    style={{ background: "var(--page-plane)", color: STATUS_COLOR[f.status] }}
                  >
                    {STATUS_LABEL[f.status]}
                  </span>
                  <span className="min-w-0 break-all" style={{ color: "var(--text-secondary)" }}>
                    {f.path}
                    {f.detail && <span style={{ color: "var(--text-muted)" }}> — {f.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {unclassifiedItems.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Unclassified items ({unclassifiedItems.length})
              </p>
              <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                These were found in your data but didn&apos;t match the taxonomy — they&apos;re shown under
                &quot;Habit / Other&quot; until src/taxonomy/overrides.json is updated for them.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unclassifiedItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardTitle>Import history</CardTitle>
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
            {history.map((log) => (
              <li key={log.id} className="flex items-center justify-between py-2 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>{new Date(log.importedAt).toLocaleString()}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {log.eventsNew} new · {log.eventsUpdated} updated · {log.eventsUnchanged} unchanged
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {archivedItems.length > 0 && (
        <Card>
          <CardTitle subtitle="No explicit archived flag exists in the source data, so this is a proxy: items with no tracked days in the 90 days before the most recent date anywhere in your data are treated as discontinued and left out of every dashboard entirely.">
            Excluded as no longer current ({archivedItems.length})
          </CardTitle>
          <ul className="flex flex-col divide-y text-xs" style={{ borderColor: "var(--gridline)" }}>
            {archivedItems.map((a) => (
              <li key={a.item} className="flex items-center justify-between py-1.5">
                <span style={{ color: "var(--text-primary)" }}>{a.item}</span>
                <span style={{ color: "var(--text-muted)" }}>last tracked {a.lastTrackedDate}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle subtitle="Removes everything from this browser's local storage. Your export files are untouched.">
          Reset local data
        </CardTitle>
        {!confirmingClear ? (
          <button
            onClick={() => setConfirmingClear(true)}
            className="rounded-md border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}
          >
            Clear all imported data
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Are you sure? This can&apos;t be undone.
            </span>
            <button
              onClick={async () => {
                await clearData();
                await loadHistory();
                setResult(null);
                setStage("idle");
                setConfirmingClear(false);
              }}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: "var(--status-critical)" }}
            >
              Yes, clear it
            </button>
            <button
              onClick={() => setConfirmingClear(false)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
