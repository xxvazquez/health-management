"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { workoutUnitLabel, type RawWorkoutLog, type RawItem, type WorkoutUnit } from "@/lib/types";
import { UNIT_STEP_PRESETS } from "@/components/ui/NumberStepper";
import { CustomIcon } from "@/components/ui/customIcons";

/** Vertical drag distance, in px, worth one `step` of value change — tuned
 * so a natural swipe adjusts a useful range without feeling twitchy or
 * needing a huge drag. */
const PIXELS_PER_STEP = 10;
/** Below this much total movement, a press+release counts as a tap (open
 * the text field) rather than a drag (adjust the value) — small enough
 * that an intentional drag never gets swallowed, big enough that a finger
 * that trembles slightly while tapping doesn't accidentally start one. */
const DRAG_THRESHOLD_PX = 4;

/** The readout in the middle of an exercise row's stepper: drag/scroll the
 * number up or down to nudge it by the fine `step`, or tap it once to get a
 * text cursor and type an exact value. Desktop wheel-scroll only engages
 * once the control is focused (tap/click it first), so scrolling the page
 * with the cursor incidentally over a row doesn't hijack it. */
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
        className="h-8 w-18 bg-transparent px-1 text-center text-sm font-medium tabular-nums outline-none"
        style={{ color: "var(--text-primary)", boxShadow: `inset 0 -2px 0 ${accent}` }}
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
      className="flex h-8 min-w-18 cursor-ns-resize items-center justify-center rounded-md px-1 text-center text-sm font-medium whitespace-nowrap tabular-nums select-none"
      style={{ color: "var(--text-primary)", touchAction: "none" }}
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
 * DEFAULT_FOR_UNKNOWN_UNIT for a custom unit typed in Settings
 * (units are free text, so this can never be exhaustive). */
const DEFAULT_VALUE_BY_UNIT: Record<WorkoutUnit, number> = { kg: 20, minutes: 20, hours: 1, reps: 10 };
const DEFAULT_FOR_UNKNOWN_UNIT = 10;

/** One row per exercise, grouped by category — set the value on the
 * stepper (± for the coarse step, drag or tap the number for fine), tap
 * Log. Every exercise is already on screen and ready to log, so logging a
 * second lift right after doesn't mean re-picking it from a list. A logged
 * set's own edit/delete/note lives in the day timeline on Summary. */
export function ExerciseRow({
  item,
  lastValue,
  todaysSets,
  isDemoData,
  accent,
  onLog,
  detail,
}: {
  item: RawItem;
  lastValue: number | undefined;
  /** This exercise's own already-logged values today, oldest first —
   * read-only summary; edit/delete that entry from the day timeline. */
  todaysSets: number[];
  isDemoData: boolean;
  accent: string;
  onLog: (value: number) => Promise<void>;
  /** Extra line under the name — the Plan view's target and status. */
  detail?: ReactNode;
}) {
  const unit: WorkoutUnit = item.unit ?? "kg";
  // A custom unit typed in Settings has no tuned preset/default —
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

  const unitLabel = workoutUnitLabel(unit);
  const nudge = (delta: number) => setValue((v) => Math.round(Math.min(preset.max, Math.max(0, v + delta)) * 100) / 100);

  return (
    <div className="flex min-h-11 items-center gap-3 px-3.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words" style={{ color: "var(--text-primary)" }}>
          {item.rawName}
        </p>
        {detail}
        {todaysSets.length > 0 && (
          <p className="flex items-center gap-1 text-xs tabular-nums" style={{ color: accent }}>
            <CheckIcon size={11} />
            {todaysSets.join(", ")} {unitLabel} today
          </p>
        )}
      </div>
      <div className="control-surface inline-flex h-8 shrink-0 items-center rounded-[10px]">
        <button
          type="button"
          onClick={() => nudge(-preset.bigStep)}
          disabled={value <= 0}
          aria-label={`Decrease ${item.rawName} by ${preset.bigStep} ${unitLabel}`}
          className="tap-target flex h-full w-7 items-center justify-center transition-opacity active:opacity-50 disabled:opacity-30"
          style={{ color: accent }}
        >
          <MinusIcon size={12} />
        </button>
        <ScrollTypeValue value={value} onChange={setValue} unit={unitLabel} accent={accent} step={preset.step} max={preset.max} />
        <button
          type="button"
          onClick={() => nudge(preset.bigStep)}
          disabled={value >= preset.max}
          aria-label={`Increase ${item.rawName} by ${preset.bigStep} ${unitLabel}`}
          className="tap-target flex h-full w-7 items-center justify-center transition-opacity active:opacity-50 disabled:opacity-30"
          style={{ color: accent }}
        >
          <PlusIcon size={12} />
        </button>
      </div>
      <Button
        variant="tinted"
        size="xs"
        accent={accent}
        onClick={() => void handleLog()}
        disabled={saving || isDemoData}
        title={isDemoData ? "Sign in to log" : undefined}
        aria-label={`Log ${item.rawName}`}
        className="shrink-0 text-sm!"
      >
        {saving ? "Saving…" : "Log"}
      </Button>
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
  onSave,
}: {
  /** Active exercises grouped by category, A-Z within each — see
   * log/page.tsx's `workoutGroupedByCategory`. `chrome` carries the
   * category's custom header colour / icon key, null where unset. */
  groups: { category: string; items: RawItem[]; chrome: { color: string | null; iconKey: string | null } }[];
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
  onSave: (entry: NewWorkoutEntry) => Promise<void>;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No exercises yet — add one in Settings.
      </p>
    );
  }
  return (
    <div className={`grid gap-4 ${groups.length > 1 ? "lg:grid-cols-2 lg:items-start" : ""}`}>
      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            {group.chrome.iconKey && (
              <span style={{ color: group.chrome.color ?? accent }}>
                <CustomIcon icon={group.chrome.iconKey} size={13} />
              </span>
            )}
            {group.category}
          </h3>
          <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
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
        </section>
      ))}
    </div>
  );
}
