"use client";

import { DateTimePicker } from "@/components/ui/DatePicker";
import { useState, type FormEvent } from "react";
import { useVitals } from "@/lib/useVitals";
import { addDaysToDate, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import { Segmented } from "@/components/ui/Segmented";
import { DateRangeFilter, type DateRangePreset } from "@/components/ui/DateRangeFilter";
import type { BloodPressureReading, WeightReading, WeightTarget } from "@/lib/supabase/vitals";
import { bpCategory } from "@/lib/aggregations/vitals";
import { LabMarkerChart } from "@/components/charts/LabMarkerChart";
import { BloodPressureChart } from "@/components/charts/BloodPressureChart";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { IconAction, PencilIcon, TrashIcon, formatDateTime, toLocalInput } from "./shared";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";

type Kind = "bp" | "weight";

/** Same rolling-window wording as every other analytics dashboard's
 * `DateRangeFilter`, anchored at today rather than the dataset's own end —
 * a vitals reading is meant to be read against "how long ago", not against
 * whenever the last one happened to be logged. */
const VITALS_DATE_PRESETS: DateRangePreset[] = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "All time", days: "all" },
];

/** Legend for the blood-pressure chart: its two lines, then the shaded
 * category zones in the same tints the chart draws them with. */
const BP_LEGEND_LINES = [
  { label: "Systolic", color: "var(--series-magenta)" },
  { label: "Diastolic", color: "var(--series-2)" },
];
const BP_LEGEND_ZONES = [
  { label: "Elevated", color: "var(--series-3)" },
  { label: "Stage 1", color: "var(--status-warning)" },
  { label: "Stage 2", color: "var(--status-critical)" },
];

function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

function WindowEmpty() {
  return (
    <p className="py-10 text-center text-xs" style={{ color: "var(--text-muted)" }}>
      No readings in this window — widen it above.
    </p>
  );
}

function parseIntOrNull(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isInteger(n) ? n : null;
}

function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

// --- Blood-pressure form --------------------------------------------

function BpForm({
  accent,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  initial?: BloodPressureReading;
  onSave: (v: { measuredAt: string; systolic: number; diastolic: number; pulse: number | null; note: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [measuredAt, setMeasuredAt] = useState(initial ? toLocalInput(initial.measuredAt) : nowLocalInput());
  const [systolic, setSystolic] = useState(initial ? String(initial.systolic) : "");
  const [diastolic, setDiastolic] = useState(initial ? String(initial.diastolic) : "");
  const [pulse, setPulse] = useState(initial?.pulse != null ? String(initial.pulse) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sys = parseIntOrNull(systolic);
  const dia = parseIntOrNull(diastolic);
  const canSave = sys != null && dia != null && sys > dia && measuredAt.length > 0;
  const preview = sys != null && dia != null ? bpCategory(sys, dia) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        measuredAt: new Date(measuredAt).toISOString(),
        systolic: sys as number,
        diastolic: dia as number,
        pulse: parseIntOrNull(pulse),
        note,
      });
    } catch (err) {
      console.error("blood pressure save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell title={initial ? "Edit reading" : "New reading"} onSubmit={handleSubmit} onCancel={onCancel} submitLabel={initial ? "Done" : "Add"} submitDisabled={!canSave || saving} busy={saving} accent={accent}>
      <FormGroup
        footer={
          <>
            {preview && (
              <span className="block">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: preview.color }} aria-hidden="true" />
                {preview.label}
              </span>
            )}
            {sys != null && dia != null && sys <= dia && (
              <span className="block" style={{ color: "var(--status-warning)" }}>
                Systolic should be higher than diastolic.
              </span>
            )}
          </>
        }
      >
        <Field label="Systolic" inline>
          <input autoFocus value={systolic} onChange={(e) => setSystolic(e.target.value)} inputMode="numeric" placeholder="120" className={`${ROW_INLINE_CLS} w-24 font-medium tabular-nums`} style={ROW_STYLE} />
        </Field>
        <Field label="Diastolic" inline>
          <input value={diastolic} onChange={(e) => setDiastolic(e.target.value)} inputMode="numeric" placeholder="80" className={`${ROW_INLINE_CLS} w-24 font-medium tabular-nums`} style={ROW_STYLE} />
        </Field>
        <Field label={<>Pulse <span style={{ color: "var(--text-muted)" }}>· optional</span></>} inline>
          <input value={pulse} onChange={(e) => setPulse(e.target.value)} inputMode="numeric" placeholder="70" className={`${ROW_INLINE_CLS} w-24 tabular-nums`} style={ROW_STYLE} />
        </Field>
        <Field label="When" inline>
          <DateTimePicker value={measuredAt} onChange={setMeasuredAt} max={todayLocalISODate()} title="When" />
        </Field>
      </FormGroup>

      <FormGroup>
        <Field label={<>Note <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Context worth remembering — time of day, after exercise, how you felt…" maxLength={400} className={`${ROW_TEXT_CLS} resize-none leading-relaxed`} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      <div className="flex flex-wrap items-center gap-3">
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </FormShell>
  );
}

// --- Weight form ---------------------------------------------------

function WeightForm({
  accent,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  initial?: WeightReading;
  onSave: (v: { measuredAt: string; kg: number; note: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [measuredAt, setMeasuredAt] = useState(initial ? toLocalInput(initial.measuredAt) : nowLocalInput());
  const [kg, setKg] = useState(initial ? String(initial.kg) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseNum(kg);
  const canSave = parsed != null && parsed > 0 && measuredAt.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ measuredAt: new Date(measuredAt).toISOString(), kg: parsed as number, note });
    } catch (err) {
      console.error("weight save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell title={initial ? "Edit weigh-in" : "New weigh-in"} onSubmit={handleSubmit} onCancel={onCancel} submitLabel={initial ? "Done" : "Add"} submitDisabled={!canSave || saving} busy={saving} accent={accent}>
      <FormGroup>
        <Field label="Weight (kg)" inline>
          <input autoFocus value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="67.5" className={`${ROW_INLINE_CLS} w-24 font-medium tabular-nums`} style={ROW_STYLE} />
        </Field>
        <Field label="When" inline>
          <DateTimePicker value={measuredAt} onChange={setMeasuredAt} max={todayLocalISODate()} title="When" />
        </Field>
      </FormGroup>

      <FormGroup>
        <Field label={<>Note <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering alongside this" maxLength={400} className={`${ROW_TEXT_CLS} resize-none leading-relaxed`} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      <div className="flex flex-wrap items-center gap-3">
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </FormShell>
  );
}

// --- Reading rows ------------------------------------------------

function BpRow({ reading, onEdit, onDelete }: { reading: BloodPressureReading; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const cat = bpCategory(reading.systolic, reading.diastolic);
  return (
    <li className="flex items-start gap-3 px-3.5 py-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
          {reading.systolic}/{reading.diastolic}
          <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>mmHg</span>
        </span>
        <span className="ml-2 text-xs" style={{ color: cat.color }}>{cat.label}</span>
        {reading.pulse != null && (
          <span className="ml-2 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>· {reading.pulse} bpm</span>
        )}
        <p className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDateTime(reading.measuredAt)}</p>
        {reading.note && <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>{reading.note}</p>}
      </div>
      <RowActions confirming={confirming} setConfirming={setConfirming} onEdit={onEdit} onDelete={onDelete} />
    </li>
  );
}

function WeightRow({ reading, previousKg, onEdit, onDelete }: { reading: WeightReading; previousKg: number | null; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const delta = previousKg != null ? Math.round((reading.kg - previousKg) * 10) / 10 : null;
  return (
    <li className="flex items-start gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
          {reading.kg} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>kg</span>
        </span>
        {delta != null && delta !== 0 && (
          <span className="ml-2 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {delta > 0 ? "+" : ""}{delta} kg
          </span>
        )}
        <p className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDateTime(reading.measuredAt)}</p>
        {reading.note && <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>{reading.note}</p>}
      </div>
      <RowActions confirming={confirming} setConfirming={setConfirming} onEdit={onEdit} onDelete={onDelete} />
    </li>
  );
}

function RowActions({
  confirming,
  setConfirming,
  onEdit,
  onDelete,
}: {
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 self-center">
      {confirming ? (
        <>
          <button type="button" onClick={onDelete} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>Delete</button>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Keep</button>
        </>
      ) : (
        <>
          <IconAction onClick={onEdit} label="Edit reading"><PencilIcon size={14} /></IconAction>
          <IconAction onClick={() => setConfirming(true)} label="Delete reading" tone="critical"><TrashIcon size={14} /></IconAction>
        </>
      )}
    </div>
  );
}

// --- Weight target -----------------------------------------------

/** The optional weight-goal range — shown above the weight chart, where it
 * also draws as a shaded band. Read-only: the range is set and cleared from
 * Settings, one place for everything editable. */
function WeightTargetControl({ target, accent }: { target: WeightTarget | null; accent: string }) {
  return (
    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
      <span>
        {target ? (
          <>
            Target{" "}
            <span className="font-semibold tabular-nums" style={{ color: accent }}>
              {target.lowKg}–{target.highKg} kg
            </span>
          </>
        ) : (
          "No weight goal set"
        )}
      </span>
      <Button href="/manage" variant="tinted" size="xs" accent={accent} className="shrink-0">
        Edit in Settings
      </Button>
    </div>
  );
}

// --- Tab -------------------------------------------------------

/** Vitals: a blood pressure / weight switch with the date window beside it,
 * the chart, then the readings. Its "+ Add" sits in the Health page's title
 * row; `composing` / `setComposing` open the new-reading form from there. */
export function VitalsTab({ accent, composing, setComposing }: { accent: string; composing: boolean; setComposing: (open: boolean) => void }) {
  const vitals = useVitals();
  const [kind, setKind] = useState<Kind>("bp");
  const [range, setRange] = useState<DateRange | null>(null);
  const [editingBp, setEditingBp] = useState<BloodPressureReading | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightReading | null>(null);

  const closeForm = () => {
    setComposing(false);
    setEditingBp(null);
    setEditingWeight(null);
  };

  const formSheet = !(composing || editingBp || editingWeight) ? null : kind === "bp" ? (
    <BpForm
      accent={accent}
      initial={editingBp ?? undefined}
      onSave={async (v) => {
        if (editingBp) await vitals.bp.edit(editingBp.id, v);
        else await vitals.bp.add(v);
        closeForm();
      }}
      onCancel={closeForm}
    />
  ) : (
    <WeightForm
      accent={accent}
      initial={editingWeight ?? undefined}
      onSave={async (v) => {
        if (editingWeight) await vitals.weight.edit(editingWeight.id, v);
        else await vitals.weight.add(v);
        closeForm();
      }}
      onCancel={closeForm}
    />
  );

  const bpAsc = [...vitals.bp.data].slice().reverse();
  const weightAsc = [...vitals.weight.data].slice().reverse();

  const today = todayLocalISODate();
  const allDates = [...vitals.bp.data, ...vitals.weight.data].map((r) => r.measuredAt.slice(0, 10));
  const earliest = allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : today;
  // Reach back at least a year so every preset shows its full length, even
  // when the first reading is more recent than that.
  const yearAgo = addDaysToDate(today, -364);
  const span: DateRange = { start: earliest < yearAgo ? earliest : yearAgo, end: today };
  const effectiveRange = range ?? span;
  const inWindow = (measuredAt: string) => {
    const d = measuredAt.slice(0, 10);
    return d >= effectiveRange.start && d <= effectiveRange.end;
  };
  const bpWindowed = bpAsc.filter((r) => inWindow(r.measuredAt));
  const weightWindowed = weightAsc.filter((r) => inWindow(r.measuredAt));
  const hasChartData = kind === "bp" ? vitals.bp.data.length > 0 : vitals.weight.data.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {formSheet}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          value={kind}
          onChange={setKind}
          accent={accent}
          options={[
            ["bp", "Blood pressure"],
            ["weight", "Weight"],
          ]}
        />
        {!vitals.loading && !vitals.error && hasChartData && (
          <DateRangeFilter span={span} value={effectiveRange} onChange={setRange} presets={VITALS_DATE_PRESETS} accent={accent} />
        )}
      </div>

      {vitals.loading ? (
        <ListSkeleton />
      ) : vitals.error ? (
        <ErrorState what="your vitals" />
      ) : kind === "bp" ? (
        vitals.bp.data.length === 0 ? (
          <InlineEmpty
            title="No blood-pressure readings yet"
            description="Add a reading — systolic, diastolic, optionally pulse — and the trend and category build up over time."
          />
        ) : (
          <>
            {bpAsc.length >= 2 && (
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                {bpWindowed.length >= 2 ? (
                  <BloodPressureChart
                    data={bpWindowed.map((r) => ({ at: r.measuredAt, systolic: r.systolic, diastolic: r.diastolic, note: r.note }))}
                    windowStart={effectiveRange.start}
                    windowEnd={effectiveRange.end}
                  />
                ) : (
                  <WindowEmpty />
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="flex items-center gap-4">
                    {BP_LEGEND_LINES.map((l) => (
                      <span key={l.label} className="inline-flex items-center gap-1.5">
                        <span className="h-0.5 w-3.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                        {l.label}
                      </span>
                    ))}
                  </span>
                  <span className="flex items-center gap-4">
                    {BP_LEGEND_ZONES.map((z) => (
                      <span key={z.label} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `color-mix(in srgb, ${z.color} 22%, transparent)` }} aria-hidden="true" />
                        {z.label}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            )}
            <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              {vitals.bp.data.map((r) => (
                <BpRow key={r.id} reading={r} onEdit={() => setEditingBp(r)} onDelete={() => void vitals.bp.remove(r.id)} />
              ))}
            </ul>
          </>
        )
      ) : vitals.weight.data.length === 0 ? (
        <>
          <WeightTargetControl target={vitals.weight.target} accent={accent} />
          <InlineEmpty title="No weigh-ins yet" description="Add a weight and the trend line builds up over time." />
        </>
      ) : (
        <>
          <WeightTargetControl target={vitals.weight.target} accent={accent} />
          {weightAsc.length >= 2 && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              {weightWindowed.length >= 2 ? (
                <LabMarkerChart
                  data={weightWindowed.map((r) => ({ date: r.measuredAt.slice(0, 10), value: r.kg }))}
                  unit="kg"
                  refLow={vitals.weight.target?.lowKg ?? null}
                  refHigh={vitals.weight.target?.highKg ?? null}
                  windowStart={effectiveRange.start}
                  windowEnd={effectiveRange.end}
                  color={accent}
                />
              ) : (
                <WindowEmpty />
              )}
            </div>
          )}
          <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {vitals.weight.data.map((r, i) => (
              <WeightRow
                key={r.id}
                reading={r}
                previousKg={vitals.weight.data[i + 1]?.kg ?? null}
                onEdit={() => setEditingWeight(r)}
                onDelete={() => void vitals.weight.remove(r.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
