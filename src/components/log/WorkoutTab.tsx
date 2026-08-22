"use client";

import { useState } from "react";
import Link from "next/link";
import { workoutUnitLabel, type RawWorkoutLog, type RawItem, type WorkoutUnit } from "@/lib/types";
import { NumberStepper, UNIT_STEP_PRESETS } from "@/components/ui/NumberStepper";

export interface NewWorkoutEntry {
  exercise: string;
  weightKg: string;
  /** Local "HH:MM" — matches the shared Time field every other tab has
   * above its picker; Workout keeps its own copy since it (like Stool)
   * renders outside that shared block. See log/page.tsx's `workoutTime`. */
  time: string;
}

/** Sensible tap-in starting point for an exercise that's never been logged
 * — kg/minutes read fine starting around 20, reps read better starting
 * lower. Only ever used once (nothing to prefill from yet); every later
 * log starts from the last value instead (see `lastValue`). */
const DEFAULT_VALUE_BY_UNIT: Record<WorkoutUnit, number> = { kg: 20, minutes: 20, reps: 10 };

/** One row per exercise, grouped by category — tap the stepper to the
 * right value, tap Log. Replaces the old single exercise-dropdown +
 * weight form: every exercise is already on screen and ready to log, so
 * logging a second lift right after doesn't mean re-picking it from a
 * list. A logged set's own edit/delete/note lives in the shared day
 * timeline below (same as every other tab), not duplicated here. */
function ExerciseRow({
  item,
  lastValue,
  todaysSets,
  isDemoData,
  accent,
  onLog,
}: {
  item: RawItem;
  lastValue: number | undefined;
  /** This exercise's own already-logged values today, oldest first —
   * read-only summary; edit/delete that entry from the day timeline. */
  todaysSets: number[];
  isDemoData: boolean;
  accent: string;
  onLog: (value: number) => Promise<void>;
}) {
  const unit: WorkoutUnit = item.unit ?? "kg";
  const preset = UNIT_STEP_PRESETS[unit];
  const [value, setValue] = useState(lastValue ?? DEFAULT_VALUE_BY_UNIT[unit]);
  const [saving, setSaving] = useState(false);

  async function handleLog() {
    if (isDemoData || saving) return;
    setSaving(true);
    await onLog(value);
    setSaving(false);
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {item.rawName}
        </p>
        {todaysSets.length > 0 && (
          <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            Logged today: {todaysSets.join(", ")} {workoutUnitLabel(unit)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <NumberStepper value={value} onChange={setValue} unit={workoutUnitLabel(unit)} accent={accent} {...preset} />
        <button
          type="button"
          onClick={() => void handleLog()}
          disabled={saving || isDemoData}
          className="h-7 rounded-md px-3 text-xs font-medium text-white disabled:opacity-40"
          style={{ background: accent }}
        >
          {isDemoData ? "Sign in to log" : saving ? "Saving…" : "Log"}
        </button>
      </div>
    </div>
  );
}

export function WorkoutTab({
  groups,
  entries,
  lastValues,
  isDemoData,
  accent,
  time,
  onTimeChange,
  onSave,
}: {
  /** Active exercises grouped by category, A-Z within each — see
   * log/page.tsx's `workoutGroupedByCategory`. */
  groups: { category: string; items: RawItem[] }[];
  /** Today's already-logged sets — used only for the read-only "Logged
   * today" summary per row; edited/deleted from the shared day timeline. */
  entries: RawWorkoutLog[];
  /** Most recently logged value per exercise, across all history (not
   * just today), in whatever unit that exercise is configured for —
   * prefill convenience so repeat entries don't need re-adjusting the
   * stepper from scratch every time. */
  lastValues: Partial<Record<string, number>>;
  isDemoData: boolean;
  accent: string;
  time: string;
  onTimeChange: (time: string) => void;
  onSave: (entry: NewWorkoutEntry) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Time
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums outline-none"
            style={{
              borderColor: "var(--series-2)",
              background: "color-mix(in oklab, var(--series-2) 14%, var(--surface-1))",
              color: "var(--text-primary)",
            }}
          />
        </label>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No exercises yet — add one on the Manage page.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <p className="text-xs font-bold tracking-wide uppercase" style={{ color: accent }}>
              {group.category}
            </p>
            <div className="flex flex-col gap-2">
              {group.items.map((item) => (
                <ExerciseRow
                  key={item.identity}
                  item={item}
                  lastValue={lastValues[item.rawName]}
                  todaysSets={entries.filter((e) => e.exercise === item.rawName).map((e) => e.weightKg)}
                  isDemoData={isDemoData}
                  accent={accent}
                  onLog={(value) => onSave({ exercise: item.rawName, weightKg: String(value), time })}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/manage/" className="self-start text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
          Add, archive, or set units for exercises on the Manage page
        </Link>
        <Link href="/workout/" className="self-start text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
          See charts and progression on the Workout page
        </Link>
      </div>
    </div>
  );
}
