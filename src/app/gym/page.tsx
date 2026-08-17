"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { putGymLog, deleteGymLogById } from "@/lib/db/indexedDb";
import { pushGymLog, deleteGymLog } from "@/lib/supabase/sync";
import { gymStatsByExercise, gymOverview, gymInsight, gymTimeline, formatGymDate, formatGymDateTime, type GymTimelineEntry } from "@/lib/aggregations/gym";
import { GYM_EXERCISES, type GymExercise, type RawGymLog } from "@/lib/types";

const EXERCISE_COLOR: Record<GymExercise, string> = {
  Squat: "var(--series-1)",
  Deadlift: "var(--series-2)",
  "Overhead Press": "var(--series-3)",
  "Power Clean": "var(--series-4)",
  "Bench Press": "var(--series-5)",
  "Push Ups": "var(--series-6)",
  "Row Machine": "var(--series-7)",
};

function todayLocalISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface EditState {
  id: string;
  date: string;
  weight: string;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** Shared chronological list — used by both the Timeline (all exercises)
 * and the single-exercise comparison view's "Historical records". */
function EntryList({
  entries,
  showExercise,
  editing,
  setEditing,
  pendingId,
  onSave,
  onDelete,
  today,
}: {
  entries: GymTimelineEntry[];
  showExercise: boolean;
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
    <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
      {entries.map((entry) => {
        const busy = pendingId === entry.id;
        if (editing?.id === entry.id) {
          return (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-md px-1.5 py-1 text-xs" style={{ background: "var(--page-plane)" }}>
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
            </li>
          );
        }
        return (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs"
            style={{ color: "var(--text-secondary)", opacity: busy ? 0.5 : 1 }}
          >
            <span className="flex items-center gap-1.5" title={`Last updated ${formatGymDateTime(entry.updatedAt)}`}>
              <span style={{ color: "var(--text-muted)" }}>{formatGymDate(entry.date)}</span>
              {showExercise && (
                <span className="font-medium" style={{ color: EXERCISE_COLOR[entry.exercise] }}>
                  {entry.exercise}
                </span>
              )}
              <span style={{ color: "var(--text-primary)" }}>{entry.weightKg} kg</span>
              {entry.isPR && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                  style={{ background: "color-mix(in oklab, var(--status-good) 16%, transparent)", color: "var(--status-good)" }}
                >
                  PR
                </span>
              )}
            </span>
            <span className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => setEditing({ id: entry.id, date: entry.date, weight: String(entry.weightKg) })}
                disabled={busy}
                aria-label={`Edit ${entry.exercise} entry on ${entry.date}`}
                className="underline decoration-dotted disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                disabled={busy}
                aria-label={`Delete ${entry.exercise} entry on ${entry.date}`}
                className="disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </span>
          </li>
        );
      })}
    </ul>
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
  const [compareExercise, setCompareExercise] = useState<GymExercise | null>(null);

  const stats = useMemo(() => gymStatsByExercise(gymLogs), [gymLogs]);
  const overview = useMemo(() => gymOverview(gymLogs), [gymLogs]);
  const insight = useMemo(() => gymInsight(gymLogs), [gymLogs]);
  const timeline = useMemo(() => gymTimeline(gymLogs), [gymLogs]);

  const selectedExercise = compareExercise && stats.some((s) => s.exercise === compareExercise) ? compareExercise : (stats[0]?.exercise ?? null);
  const selectedStats = stats.find((s) => s.exercise === selectedExercise) ?? null;
  const filteredTimeline = timelineFilter === "all" ? timeline : timeline.filter((e) => e.exercise === timelineFilter);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

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
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Gym
      </h1>

      <Insight label="What's new" headline={insight.headline} detail={insight.detail} tone={insight.tone} />

      {!insight.insufficientData && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Exercises tracked" value={String(overview.exercisesTracked)} />
          <StatTile label="Total records" value={String(overview.totalRecords)} />
          <StatTile label="Personal records set" value={String(overview.totalPRs)} accent="var(--status-good)" />
          <StatTile
            label="Most improved"
            value={overview.mostImproved ? overview.mostImproved.exercise : "—"}
            detail={overview.mostImproved ? `${signed(overview.mostImproved.changePct)}%` : undefined}
          />
        </div>
      )}

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
              onChange={(e) => setExercise(e.target.value as GymExercise)}
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

      {selectedStats && (
        <Card tier="supporting">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle size="default" subtitle="The main view — pick a lift to see its full progress.">
              Exercise comparison
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

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile label="Current" value={`${selectedStats.current.weightKg} kg`} detail={formatGymDate(selectedStats.current.date)} accent={EXERCISE_COLOR[selectedStats.exercise]} />
            <StatTile label="Best" value={`${selectedStats.best.weightKg} kg`} detail={formatGymDate(selectedStats.best.date)} />
            <StatTile label="Started" value={`${selectedStats.started.weightKg} kg`} detail={formatGymDate(selectedStats.started.date)} />
            <StatTile
              label="Progress"
              value={`${signed(selectedStats.changeKg)} kg`}
              detail={selectedStats.changePct !== null ? `${signed(selectedStats.changePct)}%` : undefined}
              accent={selectedStats.changeKg >= 0 ? "var(--status-good)" : "var(--status-warning)"}
            />
            <StatTile label="Records" value={String(selectedStats.recordsCount)} />
            <StatTile label="Last recorded" value={formatGymDate(selectedStats.current.date)} />
          </div>

          <TrendAreaChart
            data={selectedStats.entries.map((e) => ({ date: e.date, value: e.weightKg }))}
            color={EXERCISE_COLOR[selectedStats.exercise]}
            valueLabel={`${selectedStats.exercise} (kg)`}
            height={200}
          />

          <p className="mt-4 mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Historical records
          </p>
          <EntryList
            entries={[...selectedStats.entries].reverse().map((e) => ({ id: e.id, date: e.date, exercise: selectedStats.exercise, weightKg: e.weightKg, updatedAt: e.updatedAt, isPR: e.isPR }))}
            showExercise={false}
            editing={editing}
            setEditing={setEditing}
            pendingId={pendingId}
            onSave={(entry) => void handleSaveEdit(entry)}
            onDelete={(id) => void handleDelete(id)}
            today={today}
          />
        </Card>
      )}

      <Card tier="supporting">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle size="default" subtitle="Every session logged, most recent first.">
            Timeline
          </CardTitle>
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
          showExercise
          editing={editing}
          setEditing={setEditing}
          pendingId={pendingId}
          onSave={(entry) => void handleSaveEdit(entry)}
          onDelete={(id) => void handleDelete(id)}
          today={today}
        />
      </Card>
    </div>
  );
}
