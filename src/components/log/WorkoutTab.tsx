"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workoutUnitLabel, type RawWorkoutLog, type RawItem, type WorkoutUnit } from "@/lib/types";
import { UNIT_STEP_PRESETS } from "@/components/ui/NumberStepper";

/** Vertical drag distance, in px, worth one `step` of value change — tuned
 * so a natural swipe adjusts a useful range without feeling twitchy or
 * needing a huge drag. */
const PIXELS_PER_STEP = 10;
/** Below this much total movement, a press+release counts as a tap (open
 * the text field) rather than a drag (adjust the value) — small enough
 * that an intentional drag never gets swallowed, big enough that a finger
 * that trembles slightly while tapping doesn't accidentally start one. */
const DRAG_THRESHOLD_PX = 4;

/** Same idea as an iPhone quantity field: drag/scroll the number up or
 * down to nudge it by `step`, or tap it once to get a text cursor and type
 * an exact value. Replaces the old fixed -2.5/-0.25/+0.25/+2.5 buttons,
 * which didn't scale to every unit (reps/hours want different jump sizes)
 * and took 4 taps to move any real distance. Desktop wheel-scroll only
 * engages once the control is focused (tap/click it first), so scrolling
 * the page with the cursor incidentally over a row doesn't hijack it. */
function ScrollTypeValue({
  value,
  onChange,
  unit,
  accent,
  step,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  unit: string;
  accent: string;
  step: number;
  max: number;
}) {
  const min = 0;
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [focused, setFocused] = useState(false);
  const dragRef = useRef<{ startY: number; startValue: number; moved: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }

  function applyDelta(deltaY: number, fromValue: number) {
    // Round off float drift (43.75000000000001) from repeated step math —
    // finer than any current step size, so it never visibly rounds a value.
    const steps = Math.trunc(deltaY / PIXELS_PER_STEP);
    onChange(Math.round(clamp(fromValue + steps * step) * 100) / 100);
  }

  function startEditing() {
    setDraftText(String(value));
    setEditing(true);
  }

  function commitEdit() {
    const parsed = parseFloat(draftText.replace(",", "."));
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    setEditing(false);
  }

  function beginDrag(startY: number) {
    dragRef.current = { startY, startValue: value, moved: false };
  }

  function continueDrag(clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaY = drag.startY - clientY; // dragging up = increase
    if (Math.abs(deltaY) > DRAG_THRESHOLD_PX) drag.moved = true;
    applyDelta(deltaY, drag.startValue);
  }

  function endDrag() {
    const wasDrag = dragRef.current?.moved;
    dragRef.current = null;
    if (!wasDrag) startEditing();
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoFocus
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-16 rounded-md border px-1.5 text-center text-xs font-semibold tabular-nums outline-none"
        style={{ borderColor: accent, color: "var(--text-primary)" }}
      />
    );
  }

  return (
    <div
      role="spinbutton"
      aria-label={`${unit} value`}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseDown={(e) => {
        beginDrag(e.clientY);
        const onMove = (ev: globalThis.MouseEvent) => continueDrag(ev.clientY);
        const onUp = () => {
          endDrag();
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      onTouchStart={(e) => beginDrag(e.touches[0].clientY)}
      onTouchMove={(e) => {
        e.preventDefault();
        continueDrag(e.touches[0].clientY);
      }}
      onTouchEnd={endDrag}
      onWheel={(e) => {
        if (!focused) return;
        e.preventDefault();
        applyDelta(e.deltaY > 0 ? -PIXELS_PER_STEP : PIXELS_PER_STEP, value);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          applyDelta(PIXELS_PER_STEP, value);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          applyDelta(-PIXELS_PER_STEP, value);
        } else if (e.key === "Enter") {
          startEditing();
        }
      }}
      className="flex h-7 min-w-16 cursor-ns-resize items-center justify-center rounded-md px-2 text-center text-xs font-semibold tabular-nums select-none outline-none"
      style={{ background: `color-mix(in oklab, ${accent} 12%, var(--surface-1))`, color: "var(--text-primary)", touchAction: "none" }}
    >
      {value} {unit}
    </div>
  );
}

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
 * log starts from the last value instead (see `lastValue`). Falls back to
 * DEFAULT_FOR_UNKNOWN_UNIT for a custom unit typed on the Manage page
 * (units are free text, so this can never be exhaustive). */
const DEFAULT_VALUE_BY_UNIT: Record<WorkoutUnit, number> = { kg: 20, minutes: 20, hours: 1, reps: 10 };
const DEFAULT_FOR_UNKNOWN_UNIT = 10;

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
  // A custom unit typed on the Manage page has no tuned preset/default —
  // fall back to the minutes/reps-style whole-number preset rather than
  // leaving `value` undefined (which broke the +/- buttons into NaN).
  const preset = UNIT_STEP_PRESETS[unit] ?? UNIT_STEP_PRESETS.minutes;
  const initialValue = Number.isFinite(lastValue) ? (lastValue as number) : (DEFAULT_VALUE_BY_UNIT[unit] ?? DEFAULT_FOR_UNKNOWN_UNIT);
  const [value, setValue] = useState(initialValue);
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
        <ScrollTypeValue value={value} onChange={setValue} unit={workoutUnitLabel(unit)} accent={accent} step={preset.step} max={preset.max} />
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
