"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { putGymLog, deleteGymLogById } from "@/lib/db/indexedDb";
import { pushGymLog, deleteGymLog } from "@/lib/supabase/sync";
import {
  describeProgression,
  gymConsistencySummary,
  gymExerciseFrequency,
  gymInsight,
  gymMonthlySessions,
  gymStatsByExercise,
  gymTimeline,
  formatGymDate,
  type GymExerciseStats,
  type GymTimelineEntry,
} from "@/lib/aggregations/gym";
import { formatMonthYear, todayLocalISODate } from "@/lib/aggregations/common";
import type { Bullet } from "@/lib/aggregations/insights";
import { GYM_EXERCISES, type GymExercise, type RawGymLog } from "@/lib/types";

// Only hues on the Lauva brand's own leaf→wave→lavender→dot arc — the
// broader categorical palette's warm accents (series-5/7, added purely to
// stretch an 8-way chart palette) don't belong on a page with no such
// constraint to work around.
const EXERCISE_COLOR: Record<GymExercise, string> = {
  Squat: "var(--series-6)",
  Deadlift: "var(--series-1)",
  "Overhead Press": "var(--series-2)",
  "Power Clean": "var(--series-indigo)",
  "Bench Press": "var(--series-3)",
  "Push Ups": "var(--series-magenta)",
  "Row Machine": "var(--series-4)",
};

interface EditState {
  id: string;
  date: string;
  weight: string;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** Sorts exercises with a real trend to the top, most improved first — a
 * single data point has nothing to rank (no second reading to compare
 * against yet), so it always sinks to the bottom rather than reading as
 * "0% change". */
function trendRank(s: GymExerciseStats): number {
  return s.recordsCount >= 2 && s.changePct !== null ? s.changePct : -Infinity;
}

/** Compact label/value block for the Progression card's Started/Current/
 * Best/Change figures — deliberately small (not the app's big hero StatTile
 * treatment), since these are supporting detail for the chart above them,
 * not the page's main point. */
function ProgressionStat({ label, value, detail, accent }: { label: string; value: string; detail?: string; accent?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </p>
      {detail && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

/** "SQ", "BP", "OP" — a plain two-letter monogram, not an emoji or icon
 * asset, to keep the row marker calm and data-oriented rather than decorative. */
function monogram(exercise: GymExercise): string {
  const words = exercise.split(" ");
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : exercise.slice(0, 2).toUpperCase();
}

/** Ranked start→current→best→change per exercise — answers "which lift has
 * progressed the most" via row order and a proportional bar, not just a
 * table of numbers. Each row is colored by its own exercise (icon, name,
 * bar, change figure) so rows are distinguishable at a glance. Clicking a
 * row loads that exercise into the detail chart below. */
function StrengthProgressTable({
  stats,
  selected,
  onSelect,
}: {
  stats: GymExerciseStats[];
  selected: GymExercise | null;
  onSelect: (exercise: GymExercise) => void;
}) {
  const sorted = useMemo(() => [...stats].sort((a, b) => trendRank(b) - trendRank(a)), [stats]);
  const maxAbsChangeKg = useMemo(
    () => Math.max(1, ...sorted.filter((s) => s.recordsCount >= 2).map((s) => Math.abs(s.changeKg))),
    [sorted],
  );
  return (
    <Card tier="supporting">
      <CardTitle subtitle="Ranked by improvement, full history — tap a row for its full progression. Not affected by the range filter above.">
        Strength progress
      </CardTitle>
      <div className="flex flex-col">
        {sorted.map((s) => {
          const hasTrend = s.recordsCount >= 2;
          const active = s.exercise === selected;
          const color = EXERCISE_COLOR[s.exercise];
          const barPct = hasTrend ? Math.max(4, Math.round((Math.abs(s.changeKg) / maxAbsChangeKg) * 100)) : 0;
          return (
            <button
              key={s.exercise}
              type="button"
              onClick={() => onSelect(s.exercise)}
              className="flex w-full items-center gap-4 border-t py-3.5 pr-3 pl-3 text-left transition-colors first:border-t-0"
              style={{ borderColor: "var(--gridline)", background: active ? "var(--page-plane)" : "transparent", borderLeft: `3px solid ${color}` }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                style={{ background: `color-mix(in oklab, ${color} 14%, var(--surface-1))`, color }}
              >
                {monogram(s.exercise)}
              </div>

              <div className="w-28 shrink-0 sm:w-36">
                <p className="text-sm font-semibold" style={{ color }}>
                  {s.exercise}
                </p>
                <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {s.started.weightKg} → {s.current.weightKg} kg
                </p>
              </div>

              <div className="hidden flex-1 sm:block">
                <div className="h-1.5 w-full rounded-full" style={{ background: "var(--gridline)" }}>
                  {hasTrend && <div className="h-1.5 rounded-full" style={{ width: `${barPct}%`, background: color }} />}
                </div>
              </div>

              <div className="ml-auto shrink-0 text-right">
                {hasTrend ? (
                  <p className="text-sm font-semibold tabular-nums" style={{ color }}>
                    {s.changeKg >= 0 ? "↑" : "↓"} {signed(s.changeKg)} kg
                    {s.changePct !== null && <span className="font-normal"> · {signed(s.changePct)}%</span>}
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    First entry
                  </p>
                )}
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Best {s.best.weightKg} kg
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Start = first recorded weight · Current = most recent · Best = personal record
      </p>
    </Card>
  );
}

/** The Timeline's entry cards — same visual language as /log's daily
 * timeline strip (small rounded-lg card, colored accent dot, monospaced
 * date, inline delete), adapted to a vertical scrolling list since this
 * spans months of history rather than one day's few entries. */
function EntryList({
  entries,
  editing,
  setEditing,
  pendingId,
  onSave,
  onDelete,
  today,
}: {
  entries: GymTimelineEntry[];
  editing: EditState | null;
  setEditing: (e: EditState | null) => void;
  pendingId: string | null;
  onSave: (entry: GymTimelineEntry) => void;
  onDelete: (id: string) => void;
  today: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Nothing here yet.
      </p>
    );
  }
  return (
    <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
      {entries.map((entry) => {
        const busy = pendingId === entry.id;
        const color = EXERCISE_COLOR[entry.exercise];
        if (editing?.id === entry.id) {
          return (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-xs"
              style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)" }}
            >
              <input
                type="date"
                value={editing.date}
                max={today}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                className="rounded-md border px-2 py-1"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              />
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                className="w-20 rounded-md border px-2 py-1"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              />
              <button type="button" onClick={() => onSave(entry)} disabled={busy} className="font-medium disabled:opacity-40" style={{ color: "var(--status-good)" }}>
                Save
              </button>
              <button type="button" onClick={() => setEditing(null)} disabled={busy} className="disabled:opacity-40" style={{ color: "var(--text-muted)" }}>
                Cancel
              </button>
            </div>
          );
        }
        return (
          <div
            key={entry.id}
            className="flex flex-col gap-1 rounded-lg border px-2.5 py-2"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", opacity: busy ? 0.5 : 1 }}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
              <span className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                {formatGymDate(entry.date)}
              </span>
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                disabled={busy}
                aria-label={`Delete ${entry.exercise} entry on ${entry.date}`}
                className="ml-auto text-xs leading-none disabled:opacity-40"
                style={{ color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap" style={{ color }}>
                {entry.exercise}
              </span>
              <span className="text-sm whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                {entry.weightKg} kg
              </span>
              {entry.isPR && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                  style={{ background: "color-mix(in oklab, var(--status-good) 16%, transparent)", color: "var(--status-good)" }}
                >
                  PR
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditing({ id: entry.id, date: entry.date, weight: String(entry.weightKg) })}
                disabled={busy}
                aria-label={`Edit ${entry.exercise} entry on ${entry.date}`}
                className="ml-auto text-xs underline decoration-dotted disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GymPage() {
  const { status, gymLogs, refresh } = useData();
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [exercise, setExercise] = useState<GymExercise>("Squat");
  const [weight, setWeight] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<GymExercise | "all">("all");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [compareExercise, setCompareExercise] = useState<GymExercise | null>(null);
  const [weightPrefillSignal, setWeightPrefillSignal] = useState<string | null>(null);

  const { span, range, setRange, filtered: filteredGymLogs } = useDateRangeFilter(gymLogs);

  // Strength progress and Progression track a lift since its very first
  // recorded weight — filtering those to the range picker below would make
  // "Started" and "Best" wrong (they'd only reflect whatever's inside the
  // window), so they always read the full history. Only the frequency-style
  // cards (how often you trained, which lifts) are scoped to the range.
  const stats = useMemo(() => gymStatsByExercise(gymLogs), [gymLogs]);
  const insight = useMemo(() => gymInsight(gymLogs, today), [gymLogs, today]);
  const consistency = useMemo(() => gymConsistencySummary(gymLogs, today), [gymLogs, today]);
  const monthlySessions = useMemo(() => gymMonthlySessions(filteredGymLogs), [filteredGymLogs]);
  const exerciseFrequency = useMemo(() => gymExerciseFrequency(filteredGymLogs), [filteredGymLogs]);
  const timeline = useMemo(() => gymTimeline(gymLogs), [gymLogs]);

  const selectedExercise = compareExercise && stats.some((s) => s.exercise === compareExercise) ? compareExercise : (stats[0]?.exercise ?? null);
  const selectedStats = stats.find((s) => s.exercise === selectedExercise) ?? null;
  const filteredTimeline = timelineFilter === "all" ? timeline : timeline.filter((e) => e.exercise === timelineFilter);

  // Prefills the weight field with that exercise's last logged weight, so
  // repeat entries (the common case) don't need retyping from scratch. Keyed
  // on exercise + that exercise's last weight, so it fires once per actual
  // change (exercise switch, or a new log arriving) and never fights the
  // user clearing the field to type something else.
  const lastWeightForExercise = stats.find((s) => s.exercise === exercise)?.current.weightKg;
  const prefillSignal = `${exercise}:${lastWeightForExercise ?? ""}`;
  if (weightPrefillSignal !== prefillSignal) {
    setWeightPrefillSignal(prefillSignal);
    if (weight === "" && lastWeightForExercise !== undefined) {
      setWeight(String(lastWeightForExercise));
    }
  }

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  // Skip whatever the hero Insight already said outright, so the bullets
  // add context rather than repeating the headline in smaller text.
  const heroCoversFrequencyChange = insight?.headline.startsWith("Training frequency") ?? false;
  const heroCoversCurrentGap = insight?.headline.startsWith("It's been") ?? false;

  const consistencyBullets: Bullet[] = [];
  if (!consistency.insufficientData && consistency.recentAvgPerMonth !== null) {
    if (
      !heroCoversFrequencyChange &&
      consistency.priorAvgPerMonth !== null &&
      consistency.recentAvgPerMonth !== consistency.priorAvgPerMonth
    ) {
      consistencyBullets.push({
        label: "Training frequency",
        detail: `${consistency.recentAvgPerMonth} sessions/month over the last 3 months, compared with ${consistency.priorAvgPerMonth} the 3 months before.`,
        compact: `${consistency.recentAvgPerMonth}/mo recently · ${consistency.priorAvgPerMonth}/mo before`,
      });
    }
    if (consistency.longestGapDays !== null && consistency.longestGapDays >= 10) {
      consistencyBullets.push({
        label: "Longest gap",
        detail: `${consistency.longestGapDays} days without a session, ${formatGymDate(consistency.longestGapStart!)}–${formatGymDate(consistency.longestGapEnd!)}.`,
        compact: `${consistency.longestGapDays} days`,
      });
    }
    if (!heroCoversCurrentGap && consistency.currentGapDays !== null && consistency.currentGapDays >= 10) {
      consistencyBullets.push({
        label: "Current gap",
        detail: `${consistency.currentGapDays} days since the last logged session.`,
        compact: `${consistency.currentGapDays} days so far`,
      });
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = Number(weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0) return;
    setSubmitting(true);
    const log: RawGymLog = { id: crypto.randomUUID(), date, exercise, weightKg, updatedAt: Date.now() };
    await putGymLog(log);
    await refresh();
    setSubmitting(false);
    setWeight("");
    void pushGymLog(log);
  }

  async function handleDelete(id: string) {
    setPendingId(id);
    await deleteGymLogById(id);
    await refresh();
    setPendingId(null);
    void deleteGymLog(id);
  }

  async function handleSaveEdit(entry: GymTimelineEntry) {
    if (!editing || editing.id !== entry.id) return;
    const weightKg = Number(editing.weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || !editing.date) return;
    setPendingId(entry.id);
    const updated: RawGymLog = { id: entry.id, exercise: entry.exercise, date: editing.date, weightKg, updatedAt: Date.now() };
    await putGymLog(updated);
    await refresh();
    setPendingId(null);
    setEditing(null);
    void pushGymLog(updated);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <h1 className="text-xl font-semibold tracking-tight lg:col-span-2" style={{ color: "var(--text-primary)" }}>
        Gym
      </h1>

      <Card tier="raw">
        <CardTitle size="sm">Log a lift</CardTitle>
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Date
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Exercise
            <select
              value={exercise}
              onChange={(e) => {
                setExercise(e.target.value as GymExercise);
                setWeight("");
              }}
              className="rounded-md border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            >
              {GYM_EXERCISES.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Weight (kg)
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 100"
              className="w-28 rounded-md border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !weight}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: "var(--series-1)" }}
          >
            {submitting ? "Saving…" : "Log it"}
          </button>
        </form>
      </Card>

      {(insight || consistencyBullets.length > 0) && (
        <div className="flex flex-col gap-5 lg:col-span-2">
          {insight && <Insight label="What's happening" headline={insight.headline} detail={insight.detail} tone={insight.tone} />}
          {consistencyBullets.length > 0 && <BulletList title="What changed" tone="var(--text-muted)" bullets={consistencyBullets} />}
        </div>
      )}

      {span && range && (
        <div
          className="flex flex-wrap items-end justify-between gap-3 border-t pt-4 lg:col-span-2"
          style={{ borderColor: "var(--gridline)" }}
        >
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              Evidence
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {range.start} – {range.end}
            </p>
          </div>
          <DateRangeFilter span={span} value={range} onChange={setRange} />
        </div>
      )}

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Any day at least one lift was logged, by month, in this range">Training frequency</CardTitle>
        {monthlySessions.length > 1 ? (
          <TrendAreaChart
            data={monthlySessions.map((m) => ({ date: m.monthStart, value: m.sessions }))}
            color="var(--series-1)"
            valueLabel="Sessions"
            xTickFormatter={formatMonthYear}
            showEveryTick
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough data yet to show a monthly trend.</p>
        )}
      </Card>

      {exerciseFrequency.length > 0 && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Sessions each exercise appeared in — logging frequency, not training volume or load">
            Which lifts you train most
          </CardTitle>
          <RankedBarChart
            data={exerciseFrequency.map((e) => ({ label: e.exercise, value: e.sessionCount, color: EXERCISE_COLOR[e.exercise] }))}
          />
        </Card>
      )}

      {stats.length > 0 && (
        <div className="lg:col-span-2">
          <StrengthProgressTable stats={stats} selected={selectedExercise} onSelect={setCompareExercise} />
        </div>
      )}

      {selectedStats && (
        <Card tier="supporting" className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle size="default" subtitle="Pick a lift to see its full progression — full history, not affected by the range filter above.">
              Progression
            </CardTitle>
            <select
              value={selectedStats.exercise}
              onChange={(e) => setCompareExercise(e.target.value as GymExercise)}
              className="rounded-md border px-2.5 py-1.5 text-sm font-medium"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            >
              {stats.map((s) => (
                <option key={s.exercise} value={s.exercise}>
                  {s.exercise}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ProgressionStat label="Started" value={`${selectedStats.started.weightKg} kg`} detail={formatGymDate(selectedStats.started.date)} />
            <ProgressionStat
              label="Current"
              value={`${selectedStats.current.weightKg} kg`}
              detail={formatGymDate(selectedStats.current.date)}
              accent={EXERCISE_COLOR[selectedStats.exercise]}
            />
            <ProgressionStat label="Best" value={`${selectedStats.best.weightKg} kg`} detail={formatGymDate(selectedStats.best.date)} />
            <ProgressionStat
              label="Change"
              value={`${signed(selectedStats.changeKg)} kg`}
              detail={selectedStats.changePct !== null ? `${signed(selectedStats.changePct)}%` : undefined}
              accent={selectedStats.changeKg >= 0 ? "var(--status-good)" : "var(--status-warning)"}
            />
          </div>

          <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {describeProgression(selectedStats)}
          </p>

          <TrendAreaChart
            data={selectedStats.entries.map((e) => ({ date: e.date, value: e.weightKg }))}
            color={EXERCISE_COLOR[selectedStats.exercise]}
            valueLabel={`${selectedStats.exercise} (kg)`}
            height={200}
            xTickFormatter={formatMonthYear}
            yTickFormatter={(v) => `${v} kg`}
          />
        </Card>
      )}

      <Card tier="supporting" className="lg:col-span-2">
        <button
          type="button"
          onClick={() => setTimelineOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Timeline
            </h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {timeline.length} session{timeline.length === 1 ? "" : "s"} logged — the progression above already
              summarizes it; open this to edit or delete a specific entry.
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            {timelineOpen ? "Hide" : "Show"}
          </span>
        </button>
        {timelineOpen && (
          <div className="mt-4">
            <div className="mb-3 flex justify-end">
              <select
                value={timelineFilter}
                onChange={(e) => setTimelineFilter(e.target.value as GymExercise | "all")}
                className="rounded-md border px-2.5 py-1.5 text-sm"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              >
                <option value="all">All exercises</option>
                {stats.map((s) => (
                  <option key={s.exercise} value={s.exercise}>
                    {s.exercise}
                  </option>
                ))}
              </select>
            </div>
            <EntryList
              entries={filteredTimeline}
              editing={editing}
              setEditing={setEditing}
              pendingId={pendingId}
              onSave={(entry) => void handleSaveEdit(entry)}
              onDelete={(id) => void handleDelete(id)}
              today={today}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
