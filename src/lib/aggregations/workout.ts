import { workoutValueLabel, type WorkoutExercise, type WorkoutUnit, type RawWorkoutLog } from "@/lib/types";
import { addDaysToDate, isoWeekStart, round1, type DateRange } from "./common";

/** Bridges workout data into the cross-domain association engine (`patterns.ts`)
 * as a plain date-set — "did a workout session happen
 * that day" — without pulling in the full items/logs infra this simple
 * check doesn't need. */
export function workoutTrainedDates(logs: RawWorkoutLog[]): Set<string> {
  return new Set(logs.map((l) => l.date));
}

/** Time-based exercises (a walk, a run): a shorter session isn't a
 * regression, and a day's entries add up rather than compete. */
export function isTimedUnit(unit: WorkoutUnit): boolean {
  return workoutValueLabel(unit) === "Duration";
}

/** One exercise on one day: the total time for a timed exercise, the
 * heaviest (or highest) entry for anything else. */
export interface WorkoutSession {
  date: string;
  value: number;
}

export interface WorkoutExerciseSummary {
  exercise: WorkoutExercise;
  unit: WorkoutUnit;
  timed: boolean;
  /** Ascending by date. */
  sessions: WorkoutSession[];
  best: WorkoutSession;
  last: WorkoutSession;
  total: number;
  average: number;
}

function sessionsByExercise(logs: RawWorkoutLog[], unitByExercise: ReadonlyMap<string, WorkoutUnit>): Map<WorkoutExercise, WorkoutSession[]> {
  const byKey = new Map<string, { exercise: WorkoutExercise; date: string; value: number }>();
  for (const l of logs) {
    const timed = isTimedUnit(unitByExercise.get(l.exercise) ?? "kg");
    const key = `${l.exercise}\u0000${l.date}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { exercise: l.exercise, date: l.date, value: l.weightKg });
    else prev.value = timed ? prev.value + l.weightKg : Math.max(prev.value, l.weightKg);
  }
  const out = new Map<WorkoutExercise, WorkoutSession[]>();
  for (const { exercise, date, value } of byKey.values()) {
    const list = out.get(exercise) ?? [];
    list.push({ date, value: round1(value) });
    out.set(exercise, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Each exercise trained inside `range`, most sessions first. Units come
 * from the exercise's `workout_items.unit`; without one an exercise is kg. */
export function workoutExerciseSummaries(
  logs: RawWorkoutLog[],
  range: DateRange,
  unitByExercise: ReadonlyMap<string, WorkoutUnit> = new Map(),
): WorkoutExerciseSummary[] {
  const inRange = logs.filter((l) => l.date >= range.start && l.date <= range.end);
  return Array.from(sessionsByExercise(inRange, unitByExercise), ([exercise, sessions]) => {
    const unit = unitByExercise.get(exercise) ?? "kg";
    const total = round1(sessions.reduce((n, s) => n + s.value, 0));
    return {
      exercise,
      unit,
      timed: isTimedUnit(unit),
      sessions,
      best: sessions.reduce((max, s) => (s.value > max.value ? s : max), sessions[0]),
      last: sessions[sessions.length - 1],
      total,
      average: round1(total / sessions.length),
    };
  }).sort((a, b) => b.sessions.length - a.sessions.length || a.exercise.localeCompare(b.exercise));
}

export interface WorkoutRecentEntry extends WorkoutSession {
  exercise: WorkoutExercise;
  unit: WorkoutUnit;
}

/** Every exercise session across the whole history, newest first. */
export function workoutRecentEntries(logs: RawWorkoutLog[], unitByExercise: ReadonlyMap<string, WorkoutUnit> = new Map()): WorkoutRecentEntry[] {
  const out: WorkoutRecentEntry[] = [];
  for (const [exercise, sessions] of sessionsByExercise(logs, unitByExercise)) {
    const unit = unitByExercise.get(exercise) ?? "kg";
    for (const s of sessions) out.push({ ...s, exercise, unit });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.exercise.localeCompare(b.exercise));
}

export interface WorkoutWeek {
  /** Monday of the week. */
  weekStart: string;
  /** Days trained that week, counting only days inside the range. */
  sessions: number;
}

/** Training days per week for every week the range touches, empty weeks included. */
export function workoutWeeklySessions(logs: RawWorkoutLog[], range: DateRange): WorkoutWeek[] {
  const counts = new Map<string, number>();
  for (const date of workoutTrainedDates(logs)) {
    if (date < range.start || date > range.end) continue;
    const week = isoWeekStart(date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const weeks: WorkoutWeek[] = [];
  for (let w = isoWeekStart(range.start); w <= range.end; w = addDaysToDate(w, 7)) weeks.push({ weekStart: w, sessions: counts.get(w) ?? 0 });
  return weeks;
}
