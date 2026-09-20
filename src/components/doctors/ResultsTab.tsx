"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLabs } from "@/lib/useLabs";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { LabMarker, LabResult } from "@/lib/supabase/labs";
import { ErrorState } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { ChoicePanel } from "@/components/ui/ChoicePanel";
import { Button } from "@/components/ui/Button";
import { formatDate } from "./shared";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { FormShell } from "@/components/ui/FormShell";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { parseNum } from "./labStatus";
import { BatchResultsView } from "./BatchResultsView";
import { LabsOverview } from "./LabsOverview";
import { MarkerForm } from "./labForms";

// --- Result form -----------------------------------------------------

function ResultForm({
  labs,
  accent,
  marker,
  initial,
  onDone,
  onCancel,
}: {
  labs: ReturnType<typeof useLabs>;
  accent: string;
  marker: LabMarker;
  initial?: LabResult;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ? String(initial.value) : "");
  const [measuredOn, setMeasuredOn] = useState(initial?.measuredOn ?? todayLocalISODate());
  const [lab, setLab] = useState(initial?.lab ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseNum(value);
  const canSave = parsed != null && measuredOn.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await labs.results.edit(marker.id, initial.id, { measuredOn, value: parsed as number, lab, note });
      } else {
        await labs.results.add({ markerId: marker.id, measuredOn, value: parsed as number, lab, note });
      }
      onDone();
    } catch (err) {
      console.error("lab result save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell
      title={marker.unit ? `${marker.name} (${marker.unit})` : marker.name}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    >
      <FormGroup>
        <Field label="Value" inline>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="e.g. 2.1" className={`${ROW_INLINE_CLS} w-28 font-medium`} style={ROW_STYLE} />
        </Field>
        <Field label="Date" inline>
          <input type="date" value={measuredOn} max={todayLocalISODate()} onChange={(e) => setMeasuredOn(e.target.value)} className={ROW_INLINE_CLS} style={ROW_STYLE} />
        </Field>
        <Field label="Lab · optional" inline>
          <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Where it was done" maxLength={80} className={`${ROW_INLINE_CLS} w-40`} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      <FormGroup>
        <Field label="Note · optional">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Context worth remembering — fasting, medication change…" maxLength={400} className={`${ROW_TEXT_CLS} resize-none leading-relaxed`} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" accent={accent} disabled={!canSave || saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add value"}
        </Button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </FormShell>
  );
}

// --- Tab -------------------------------------------------------------

type View =
  | { mode: "list" }
  | { mode: "batch" }
  | { mode: "marker-form" }
  | { mode: "result-form"; markerId: string; resultId?: string };

/** Health → Results: the read/analysis overview (LabsOverview) plus value
 * entry — a single value, or a whole blood draw at once. Markers get a
 * quick-add here (name, unit, panel); their reference and optimal ranges,
 * renames and panels are managed from Settings. */
export function ResultsTab({ accent }: { accent: string }) {
  const labs = useLabs();
  const [view, setView] = useState<View>({ mode: "list" });
  const [flash, setFlash] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const findMarker = (id: string) => labs.markers.data.find((m) => m.id === id) ?? null;

  if (labs.error) return <ErrorState what="your results" />;

  if (view.mode === "marker-form") {
    return (
      <MarkerForm
        labs={labs}
        accent={accent}
        fields="basic"
        onSaved={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "batch") {
    return (
      <BatchResultsView
        labs={labs}
        accent={accent}
        onDone={(summary) => {
          if (summary) {
            setFlash(`${summary.count} ${summary.count === 1 ? "value" : "values"} added · ${formatDate(summary.date)}`);
          }
          setView({ mode: "list" });
        }}
      />
    );
  }

  const editingResultMarker = view.mode === "result-form" ? findMarker(view.markerId) : null;
  if (view.mode === "result-form" && editingResultMarker) {
    return (
      <ResultForm
        labs={labs}
        accent={accent}
        marker={editingResultMarker}
        initial={view.resultId ? editingResultMarker.results.find((r) => r.id === view.resultId) : undefined}
        onDone={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  const hasMarkers = labs.markers.data.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {flash && (
        <p
          className="rounded-[10px] border px-3 py-2 text-xs font-medium"
          style={{ borderColor: accent, background: `color-mix(in oklab, ${accent} 10%, var(--surface-1))`, color: "var(--text-secondary)" }}
        >
          {flash}
        </p>
      )}

      {choosing && (
        <ChoicePanel
          title="Add to Results"
          onCancel={() => setChoosing(false)}
          options={[
            {
              label: "Add results",
              onClick: () => {
                setChoosing(false);
                setView({ mode: "batch" });
              },
            },
            {
              label: "New marker",
              onClick: () => {
                setChoosing(false);
                setView({ mode: "marker-form" });
              },
            },
          ]}
        />
      )}

      <LabsOverview
        labs={labs}
        actions={
          <PrimaryAction
            label={hasMarkers ? "Add" : "New marker"}
            accent={accent}
            onClick={() => (hasMarkers ? setChoosing(true) : setView({ mode: "marker-form" }))}
          />
        }
        onNewMarker={() => setView({ mode: "marker-form" })}
        onAddValue={(markerId) => setView({ mode: "result-form", markerId })}
        onEditValue={(markerId, result) => setView({ mode: "result-form", markerId, resultId: result.id })}
      />
    </div>
  );
}
