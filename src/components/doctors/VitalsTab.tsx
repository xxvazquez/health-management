"use client";

import { useState, type FormEvent } from "react";
import { useVitals } from "@/lib/useVitals";
import type { BloodPressureReading, WeightReading } from "@/lib/supabase/vitals";
import { bpCategory, BP_CATEGORIES } from "@/lib/aggregations/vitals";
import { LabMarkerChart } from "@/components/charts/LabMarkerChart";
import { BloodPressureChart } from "@/components/charts/BloodPressureChart";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { FIELD_CLS, FIELD_STYLE, IconAction, LABEL_CLS, LABEL_STYLE, PencilIcon, TrashIcon, formatDateTime, toLocalInput } from "./shared";

type Kind = "bp" | "weight";

function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-24 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Systolic</span>
          <input autoFocus value={systolic} onChange={(e) => setSystolic(e.target.value)} inputMode="numeric" placeholder="120" className={`${FIELD_CLS} font-medium tabular-nums`} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-24 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Diastolic</span>
          <input value={diastolic} onChange={(e) => setDiastolic(e.target.value)} inputMode="numeric" placeholder="80" className={`${FIELD_CLS} font-medium tabular-nums`} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-24 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Pulse (optional)</span>
          <input value={pulse} onChange={(e) => setPulse(e.target.value)} inputMode="numeric" placeholder="70" className={`${FIELD_CLS} tabular-nums`} style={FIELD_STYLE} />
        </label>
      </div>

      {preview && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: preview.color }} aria-hidden="true" />
          {preview.label}
        </p>
      )}
      {sys != null && dia != null && sys <= dia && (
        <p className="text-xs" style={{ color: "var(--status-warning)" }}>Systolic should be higher than diastolic.</p>
      )}

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>When</span>
        <input type="datetime-local" value={measuredAt} max={nowLocalInput()} onChange={(e) => setMeasuredAt(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Context worth remembering — time of day, after exercise, how you felt…" maxLength={400} className={`${FIELD_CLS} resize-y`} style={FIELD_STYLE} />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSave || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add reading"}
        </button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </form>
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-28 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Weight (kg)</span>
          <input autoFocus value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="67.5" className={`${FIELD_CLS} font-medium tabular-nums`} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>When</span>
          <input type="datetime-local" value={measuredAt} max={nowLocalInput()} onChange={(e) => setMeasuredAt(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering alongside this" maxLength={400} className={`${FIELD_CLS} resize-y`} style={FIELD_STYLE} />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSave || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add reading"}
        </button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </form>
  );
}

// --- Reading rows ------------------------------------------------

function BpRow({ reading, onEdit, onDelete }: { reading: BloodPressureReading; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const cat = bpCategory(reading.systolic, reading.diastolic);
  return (
    <li className="flex items-start gap-3 py-2.5">
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
    <li className="flex items-start gap-3 py-2.5">
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

// --- Tab -------------------------------------------------------

export function VitalsTab({ accent }: { accent: string }) {
  const vitals = useVitals();
  const [kind, setKind] = useState<Kind>("bp");
  const [composing, setComposing] = useState(false);
  const [editingBp, setEditingBp] = useState<BloodPressureReading | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightReading | null>(null);

  const closeForm = () => {
    setComposing(false);
    setEditingBp(null);
    setEditingWeight(null);
  };

  if (composing || editingBp || editingWeight) {
    if (kind === "bp") {
      return (
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
      );
    }
    return (
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
  }

  const bpAsc = [...vitals.bp.data].slice().reverse();
  const weightAsc = [...vitals.weight.data].slice().reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(["bp", "weight"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                borderColor: kind === k ? accent : "var(--border-hairline)",
                background: kind === k ? `color-mix(in oklab, ${accent} 12%, var(--surface-1))` : "transparent",
                color: kind === k ? accent : "var(--text-secondary)",
              }}
            >
              {k === "bp" ? "Blood pressure" : "Weight"}
            </button>
          ))}
        </div>
        <div className="hidden lg:block">
          <PrimaryAction
            label={kind === "bp" ? "New reading" : "New weigh-in"}
            accent={accent}
            onClick={() => setComposing(true)}
          />
        </div>
      </div>

      {vitals.loading ? (
        <ListSkeleton />
      ) : vitals.error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load your vitals — try again in a moment.
        </p>
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
                <BloodPressureChart data={bpAsc.map((r) => ({ at: r.measuredAt, systolic: r.systolic, diastolic: r.diastolic }))} />
                <div className="mt-2 flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <p className="flex flex-wrap gap-x-3">
                    <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--series-magenta)" }} aria-hidden="true" />Systolic</span>
                    <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--series-2)" }} aria-hidden="true" />Diastolic</span>
                  </p>
                  <p className="flex flex-wrap gap-x-3 gap-y-1">
                    {BP_CATEGORIES.map((c) => (
                      <span key={c.id}>
                        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c.color }} aria-hidden="true" />
                        {c.label}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            )}
            <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
              {vitals.bp.data.map((r) => (
                <BpRow key={r.id} reading={r} onEdit={() => setEditingBp(r)} onDelete={() => void vitals.bp.remove(r.id)} />
              ))}
            </ul>
          </>
        )
      ) : vitals.weight.data.length === 0 ? (
        <InlineEmpty title="No weigh-ins yet" description="Add a weight and the trend line builds up over time." />
      ) : (
        <>
          {weightAsc.length >= 2 && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              <LabMarkerChart
                data={weightAsc.map((r) => ({ date: r.measuredAt.slice(0, 10), value: r.kg }))}
                unit="kg"
                refLow={null}
                refHigh={null}
                color={accent}
              />
            </div>
          )}
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
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
