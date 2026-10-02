"use client";

import { DateTimePicker } from "@/components/ui/DatePicker";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useSwipeReveal, SWIPE_REVEAL_CLASS } from "@/lib/useSwipeReveal";
import { useVitals } from "@/lib/useVitals";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { Segmented } from "@/components/ui/Segmented";
import type { BloodPressureReading, WeightReading, WeightTarget } from "@/lib/supabase/vitals";
import { bpCategory } from "@/lib/aggregations/vitals";
import { LabMarkerChart, type LabMarkerChartPoint } from "@/components/charts/LabMarkerChart";
import { BloodPressureChart, type BloodPressurePoint } from "@/components/charts/BloodPressureChart";
import { TrendCard, TrendHeadline, periodLabel, periodWindow, type ChartPeriod } from "@/components/charts/TrendCard";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { FormShell } from "@/components/ui/FormShell";
import { IconAction, TrashIcon, formatDate, formatDateTime, toLocalInput } from "./shared";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Kind = "bp" | "weight";

/** Legend for the blood-pressure chart: its two lines, then what the
 * shaded zones and dots mean — green normal, blue low, red high. */
const BP_LEGEND_LINES = [
  { label: "Systolic", color: "var(--text-secondary)" },
  { label: "Diastolic", color: "var(--series-other)" },
];
const BP_LEGEND_ZONES = [
  { label: "Normal", color: "var(--status-good)" },
  { label: "Low (under 90/60)", color: "var(--series-2)" },
  { label: "High", color: "var(--status-critical)" },
];

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
    <ReadingRow onEdit={onEdit} onDelete={onDelete} confirming={confirming} setConfirming={setConfirming}>
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
    </ReadingRow>
  );
}

function WeightRow({ reading, previousKg, onEdit, onDelete }: { reading: WeightReading; previousKg: number | null; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const delta = previousKg != null ? Math.round((reading.kg - previousKg) * 10) / 10 : null;
  return (
    <ReadingRow onEdit={onEdit} onDelete={onDelete} confirming={confirming} setConfirming={setConfirming}>
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
    </ReadingRow>
  );
}

/** One reading in the list: tap it to edit, as in iOS; delete sits behind
 * a left swipe on a phone and appears on hover from `lg`, then asks once. */
function ReadingRow({
  onEdit,
  onDelete,
  confirming,
  setConfirming,
  children,
}: {
  onEdit: () => void;
  onDelete: () => void;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  children: ReactNode;
}) {
  const { revealed, onTouchStart, onTouchEnd } = useSwipeReveal();
  return (
    <li
      className="group flex cursor-pointer items-start gap-3 px-3.5 py-2.5"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={(ev) => {
        if (confirming || (ev.target as HTMLElement).closest("button")) return;
        onEdit();
      }}
    >
      {children}
      <div className="flex shrink-0 items-center gap-3 self-center">
        <span className={clsx("transition-opacity", revealed ? SWIPE_REVEAL_CLASS.shown : SWIPE_REVEAL_CLASS.hidden)}>
          <IconAction onClick={() => setConfirming(true)} label="Delete reading" tone="critical">
            <TrashIcon size={14} />
          </IconAction>
        </span>
        {confirming && (
          <ConfirmDialog
            title="Delete this reading?"
            message="This can't be undone."
            confirmLabel="Delete"
            destructive
            onConfirm={() => {
              setConfirming(false);
              onDelete();
            }}
            onClose={() => setConfirming(false)}
          />
        )}
      </div>
    </li>
  );
}

// --- Weight target -----------------------------------------------

/** The optional weight-goal range, as a small link on the Blood pressure /
 * Weight row — it also draws as the shaded band on the weight chart. It's
 * set and cleared from Settings, so tapping it goes there. */
function WeightGoalLink({ target, accent }: { target: WeightTarget | null; accent: string }) {
  return (
    <Link href="/manage" className="hit-slop ml-auto text-sm font-medium whitespace-nowrap tabular-nums" style={{ color: accent }}>
      {target ? `Goal ${target.lowKg}–${target.highKg} kg` : "Set a goal"}
    </Link>
  );
}

// --- Tab -------------------------------------------------------

/** Vitals: a blood pressure / weight switch, the trend card (period
 * picker, latest reading as a headline, the chart), then the readings. Its "+ Add" sits in the Health page's title
 * row; `composing` / `setComposing` open the new-reading form from there. */
export function VitalsTab({ accent, composing, setComposing }: { accent: string; composing: boolean; setComposing: (open: boolean) => void }) {
  const vitals = useVitals();
  const [kind, setKind] = useState<Kind>("bp");
  const [period, setPeriod] = useState<ChartPeriod>("1Y");
  const [offset, setOffset] = useState(0);
  const [bpScrub, setBpScrub] = useState<BloodPressurePoint | null>(null);
  const [weightScrub, setWeightScrub] = useState<LabMarkerChartPoint | null>(null);
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
  const allDates = (kind === "bp" ? vitals.bp.data : vitals.weight.data).map((r) => r.measuredAt.slice(0, 10));
  const earliest = allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : today;
  const span = periodWindow(period, offset, earliest, today);
  const inWindow = (measuredAt: string) => {
    const d = measuredAt.slice(0, 10);
    return d >= span.start && d <= span.end;
  };
  const bpWindowed = bpAsc.filter((r) => inWindow(r.measuredAt));
  const weightWindowed = weightAsc.filter((r) => inWindow(r.measuredAt));

  const latestBp = vitals.bp.data[0] ?? null;
  const shownBp = bpScrub ?? (latestBp ? { at: latestBp.measuredAt, systolic: latestBp.systolic, diastolic: latestBp.diastolic } : null);
  const shownBpCategory = shownBp ? bpCategory(shownBp.systolic, shownBp.diastolic) : null;
  const latestWeight = vitals.weight.data[0] ?? null;
  const shownWeight = weightScrub ?? (latestWeight ? { date: latestWeight.measuredAt.slice(0, 10), value: latestWeight.kg } : null);

  const trendCard = (headline: ReactNode, chart: ReactNode) => (
    <TrendCard
      period={period}
      onPeriod={setPeriod}
      offset={offset}
      onOffset={setOffset}
      earliest={earliest}
      today={today}
      accent={accent}
      headline={headline}
    >
      {chart}
    </TrendCard>
  );
  const emptyPeriod = (
    <p className="flex h-[220px] items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>
      No readings in this period.
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      {formSheet}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            setOffset(0);
          }}
          accent={accent}
          options={[
            ["bp", "Blood pressure"],
            ["weight", "Weight"],
          ]}
        />
        {kind === "weight" && !vitals.loading && !vitals.error && <WeightGoalLink target={vitals.weight.target} accent={accent} />}
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
            {trendCard(
              offset > 0 && !bpScrub ? (
                <TrendHeadline
                  caption="Average"
                  value={
                    bpWindowed.length > 0
                      ? `${Math.round(bpWindowed.reduce((n, r) => n + r.systolic, 0) / bpWindowed.length)}/${Math.round(bpWindowed.reduce((n, r) => n + r.diastolic, 0) / bpWindowed.length)}`
                      : "—"
                  }
                  unit={bpWindowed.length > 0 ? "mmHg" : undefined}
                  detail={`${periodLabel(span)} · ${bpWindowed.length} reading${bpWindowed.length === 1 ? "" : "s"}`}
                />
              ) : (
              shownBp && shownBpCategory && (
                <TrendHeadline
                  caption={bpScrub ? formatDate(shownBp.at) : "Latest"}
                  value={`${shownBp.systolic}/${shownBp.diastolic}`}
                  unit="mmHg"
                  color={shownBpCategory.color}
                  detail={
                    <>
                      <span className="font-semibold" style={{ color: shownBpCategory.color }}>
                        {shownBpCategory.label}
                      </span>
                      {bpScrub ? null : ` · ${formatDate(shownBp.at)}`}
                    </>
                  }
                />
              )
              ),
              <>
                {bpWindowed.length >= 1 ? (
                  <BloodPressureChart
                    data={bpWindowed.map((r) => ({ at: r.measuredAt, systolic: r.systolic, diastolic: r.diastolic, note: r.note }))}
                    windowStart={span.start}
                    windowEnd={span.end}
                    onScrub={setBpScrub}
                  />
                ) : (
                  emptyPeriod
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="flex items-center gap-4">
                    {BP_LEGEND_LINES.map((l) => (
                      <span key={l.label} className="inline-flex items-center gap-1.5">
                        <span className="h-0.5 w-3.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                        {l.label}
                      </span>
                    ))}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {BP_LEGEND_ZONES.map((z) => (
                      <span key={z.label} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `color-mix(in srgb, ${z.color} 35%, transparent)` }} aria-hidden="true" />
                        {z.label}
                      </span>
                    ))}
                  </span>
                </div>
              </>,
            )}
            <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
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
          {trendCard(
            offset > 0 && !weightScrub ? (
              <TrendHeadline
                caption="Range"
                value={
                  weightWindowed.length > 0
                    ? `${Math.min(...weightWindowed.map((r) => r.kg))}–${Math.max(...weightWindowed.map((r) => r.kg))}`
                    : "—"
                }
                unit={weightWindowed.length > 0 ? "kg" : undefined}
                detail={`${periodLabel(span)} · ${weightWindowed.length} weigh-in${weightWindowed.length === 1 ? "" : "s"}`}
              />
            ) : (
            shownWeight && (
              <TrendHeadline
                caption={weightScrub ? formatDate(shownWeight.date) : "Latest"}
                value={String(shownWeight.value)}
                unit="kg"
                detail={weightScrub ? null : formatDate(shownWeight.date)}
              />
            )
            ),
            weightWindowed.length >= 1 ? (
              <LabMarkerChart
                data={weightWindowed.map((r) => ({ date: r.measuredAt.slice(0, 10), value: r.kg }))}
                unit="kg"
                refLow={vitals.weight.target?.lowKg ?? null}
                refHigh={vitals.weight.target?.highKg ?? null}
                windowStart={span.start}
                windowEnd={span.end}
                color={accent}
                onScrub={setWeightScrub}
              />
            ) : (
              emptyPeriod
            ),
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
