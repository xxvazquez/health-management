import { WORKOUT_EXERCISES, workoutUnitLabel, type WorkoutExercise, type WorkoutUnit, type RawWorkoutLog } from "@/lib/types";
import type { InsightTone } from "./insights";
import { addDaysToDate, daysBetween, monthStart, pct, round1 } from "./common";

/** Bridges workout data into the cross-domain association engine (`patterns.ts`,
 * `bristolPatterns.ts`) as a plain date-set — "did a workout session happen
 * that day" — without pulling in the full items/logs infra this simple
 * check doesn't need. */
export function workoutTrainedDates(logs: RawWorkoutLog[]): Set<string> {
  return new Set(logs.map((l) => l.date));
}

export interface WorkoutMonthlySessions {
  monthStart: string;
  sessions: number;
}

/** Distinct training dates per calendar month — "session" here means any
 * day at least one lift was logged, since the data has no separate session
 * concept. */
export function workoutMonthlySessions(logs: RawWorkoutLog[]): WorkoutMonthlySessions[] {
  const byMonth = new Map<string, number>();
  for (const date of workoutTrainedDates(logs)) {
    const month = monthStart(date);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  return Array.from(byMonth.entries())
    .map(([monthStart, sessions]) => ({ monthStart, sessions }))
    .sort((a, b) => a.monthStart.localeCompare(b.monthStart));
}

function monthIndex(monthStartDate: string): number {
  const [y, m] = monthStartDate.slice(0, 7).split("-").map(Number);
  return y * 12 + (m - 1);
}

function shiftMonthStart(monthStartDate: string, deltaMonths: number): string {
  const total = monthIndex(monthStartDate) + deltaMonths;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export interface WorkoutConsistencySummary {
  insufficientData: boolean;
  totalSessions: number;
  /** Average sessions/month over the 3 months ending with the month of the most recent session. */
  recentAvgPerMonth: number | null;
  /** Average sessions/month over the 3 months before that — null when there isn't a full prior window of tracked history yet. */
  priorAvgPerMonth: number | null;
  longestGapDays: number | null;
  longestGapStart: string | null;
  longestGapEnd: string | null;
  /** Days between the most recent session and `asOfDate`. */
  currentGapDays: number | null;
}

const CONSISTENCY_WINDOW_MONTHS = 3;
const MIN_TRACKED_MONTHS_FOR_INSIGHT = 2;

/**
 * Training-frequency consistency: recent-vs-prior 3-month average sessions/
 * month, plus the longest and current gap between sessions. `asOfDate` is
 * passed in (rather than read from `Date.now()` inside this module) so the
 * function stays pure and testable — the page supplies today's date, the
 * same one it already uses for the log-a-lift form's date input.
 */
export function workoutConsistencySummary(logs: RawWorkoutLog[], asOfDate: string): WorkoutConsistencySummary {
  const dates = Array.from(workoutTrainedDates(logs)).sort();
  const totalSessions = dates.length;
  const empty = {
    insufficientData: true,
    totalSessions,
    recentAvgPerMonth: null,
    priorAvgPerMonth: null,
    longestGapDays: null,
    longestGapStart: null,
    longestGapEnd: null,
    currentGapDays: null,
  };
  if (dates.length === 0) return empty;

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const earliestMonth = monthStart(firstDate);
  const recentMonth = monthStart(lastDate);
  const totalTrackedMonths = monthIndex(recentMonth) - monthIndex(earliestMonth) + 1;
  if (totalTrackedMonths < MIN_TRACKED_MONTHS_FOR_INSIGHT) return empty;

  const recentWindowStart = shiftMonthStart(recentMonth, -(CONSISTENCY_WINDOW_MONTHS - 1));
  const priorWindowEnd = addDaysToDate(recentWindowStart, -1);
  const priorWindowStart = shiftMonthStart(monthStart(priorWindowEnd), -(CONSISTENCY_WINDOW_MONTHS - 1));

  const sessionsBetween = (start: string, end: string) => dates.filter((d) => d >= start && d <= end).length;

  const recentAvgPerMonth = round1(sessionsBetween(recentWindowStart, lastDate) / CONSISTENCY_WINDOW_MONTHS);
  const hasPriorWindow = earliestMonth <= priorWindowStart;
  const priorAvgPerMonth = hasPriorWindow ? round1(sessionsBetween(priorWindowStart, priorWindowEnd) / CONSISTENCY_WINDOW_MONTHS) : null;

  let longestGapDays: number | null = null;
  let longestGapStart: string | null = null;
  let longestGapEnd: string | null = null;
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i - 1], dates[i]);
    if (longestGapDays === null || gap > longestGapDays) {
      longestGapDays = gap;
      longestGapStart = dates[i - 1];
      longestGapEnd = dates[i];
    }
  }

  return {
    insufficientData: false,
    totalSessions,
    recentAvgPerMonth,
    priorAvgPerMonth,
    longestGapDays,
    longestGapStart,
    longestGapEnd,
    currentGapDays: daysBetween(lastDate, asOfDate),
  };
}

/** Every exercise that appears in `logs`, in a stable order: the 7 built-in
 * defaults first (in their original order, for anyone who hasn't renamed or
 * added anything), then anything else — a renamed or custom exercise — in
 * first-appearance order. Exercises are fully user-editable (rename/add via
 * Manage — see categoryResolution.ts's `ensureDefaultWorkoutItems`), so
 * reading the set from the logs themselves, not the fixed `WORKOUT_EXERCISES`
 * list, is what lets the functions below keep showing an exercise after
 * it's renamed or after a custom one is added — they used to iterate
 * `WORKOUT_EXERCISES` directly and simply never saw anything outside that
 * original 7. */
function exercisesInLogs(logs: RawWorkoutLog[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const l of logs) {
    if (!seen.has(l.exercise)) {
      seen.add(l.exercise);
      order.push(l.exercise);
    }
  }
  const known = WORKOUT_EXERCISES.filter((ex) => seen.has(ex));
  const custom = order.filter((ex) => !(WORKOUT_EXERCISES as readonly string[]).includes(ex));
  return [...known, ...custom];
}

export interface WorkoutExerciseFrequencyEntry {
  exercise: WorkoutExercise;
  sessionCount: number;
  sharePct: number;
}

/**
 * Distinct-date count per exercise — how often each lift actually gets
 * trained. This is the honest stand-in for "exercise balance": the data has
 * no muscle-group field, so grouping by muscle group would mean inventing a
 * taxonomy on top of a fixed 7-exercise list rather than reading it from
 * what was actually logged.
 */
export function workoutExerciseFrequency(logs: RawWorkoutLog[]): WorkoutExerciseFrequencyEntry[] {
  const totalSessions = workoutTrainedDates(logs).size;
  const counts = new Map<WorkoutExercise, Set<string>>();
  for (const l of logs) {
    const set = counts.get(l.exercise) ?? new Set<string>();
    set.add(l.date);
    counts.set(l.exercise, set);
  }
  return exercisesInLogs(logs)
    .map((ex) => ({ exercise: ex, sessionCount: counts.get(ex)!.size, sharePct: pct(counts.get(ex)!.size, totalSessions) }))
    .sort((a, b) => b.sessionCount - a.sessionCount);
}

export function formatWorkoutDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "17 Aug" — same as `formatWorkoutDate` without the year, for compact spots
 * (e.g. the Timeline's collapsed summary) where the date is always recent
 * enough that the year adds nothing. */
export function formatWorkoutDateShort(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export interface WorkoutEntry {
  id: string;
  date: string;
  weightKg: number;
  updatedAt: number;
  /** True only if this entry beats every earlier entry for this exercise —
   * the very first logged entry is a starting point, not a "record". */
  isPR: boolean;
}

export interface WorkoutExerciseStats {
  exercise: WorkoutExercise;
  /** What a `weightKg` value here actually means for this exercise (kg,
   * minutes, reps, or any other unit set on its `workout_items` row) — see
   * `RawWorkoutLog.weightKg`'s own doc comment: every read site is
   * supposed to pair the number with this rather than assume kg. Falls
   * back to "kg" when the caller doesn't have (or doesn't pass) the
   * exercise's configured unit, matching every log recorded before
   * per-exercise units existed. */
  unit: WorkoutUnit;
  /** Ascending by date. */
  entries: WorkoutEntry[];
  recordsCount: number;
  started: { date: string; weightKg: number };
  current: { date: string; weightKg: number };
  best: { date: string; weightKg: number };
  changeKg: number;
  /** null when the starting weight was 0 (division by zero). */
  changePct: number | null;
}

/**
 * Per-exercise stats — deliberately just the four groups asked for
 * (current / progress / best / activity), nothing invented on top. Missing
 * days are simply absent from `entries`, never treated as a zero — every
 * exercise has its own recording frequency and that's expected.
 *
 * `unitByExercise` maps each exercise's current display name to its
 * configured `workout_items.unit` — pass the real lookup so `unit` above
 * (and everything that formats these stats with a unit label) reflects
 * what the exercise is actually tracked in, not a blind "kg" assumption.
 */
export function workoutStatsByExercise(logs: RawWorkoutLog[], unitByExercise: ReadonlyMap<string, WorkoutUnit> = new Map()): WorkoutExerciseStats[] {
  const out: WorkoutExerciseStats[] = [];
  for (const exercise of exercisesInLogs(logs)) {
    const sorted = logs
      .filter((l) => l.exercise === exercise)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (sorted.length === 0) continue;

    let runningMax = sorted[0].weightKg;
    const entries: WorkoutEntry[] = sorted.map((l, i) => {
      const isPR = i > 0 && l.weightKg > runningMax;
      if (l.weightKg > runningMax) runningMax = l.weightKg;
      return { id: l.id, date: l.date, weightKg: l.weightKg, updatedAt: l.updatedAt, isPR };
    });

    const started = entries[0];
    const current = entries[entries.length - 1];
    const best = entries.reduce((max, e) => (e.weightKg > max.weightKg ? e : max), entries[0]);

    out.push({
      exercise,
      unit: unitByExercise.get(exercise) ?? "kg",
      entries,
      recordsCount: entries.length,
      started: { date: started.date, weightKg: started.weightKg },
      current: { date: current.date, weightKg: current.weightKg },
      best: { date: best.date, weightKg: best.weightKg },
      changeKg: round1(current.weightKg - started.weightKg),
      changePct: started.weightKg !== 0 ? round1(((current.weightKg - started.weightKg) / started.weightKg) * 100) : null,
    });
  }
  return out;
}

export interface WorkoutInsight {
  headline: string;
  detail: string | null;
  tone: InsightTone;
}

/** Plain-English progression sentence reusing `WorkoutExerciseStats`'s existing
 * fields (no new math) — e.g. "Squat has gone from 60 kg to 82 kg — up 22 kg
 * (+37%) since 12 Jan 2026." Uses `stats.unit`, not a hardcoded "kg" — see
 * `WorkoutExerciseStats.unit`'s own doc comment. */
export function describeProgression(stats: WorkoutExerciseStats): string {
  const unit = workoutUnitLabel(stats.unit);
  if (stats.recordsCount < 2) {
    return `First logged ${formatWorkoutDate(stats.started.date)} at ${stats.started.weightKg} ${unit} — log it again to see a trend.`;
  }
  if (stats.changeKg === 0) {
    return `${stats.exercise} has stayed at ${stats.current.weightKg} ${unit} since ${formatWorkoutDate(stats.started.date)}.`;
  }
  const direction = stats.changeKg > 0 ? "up" : "down";
  const changeText = `${direction} ${Math.abs(stats.changeKg)} ${unit}${stats.changePct !== null ? ` (${stats.changePct > 0 ? "+" : ""}${stats.changePct}%)` : ""}`;
  return `${stats.exercise} has gone from ${stats.started.weightKg} ${unit} to ${stats.current.weightKg} ${unit} — ${changeText} since ${formatWorkoutDate(stats.started.date)}.`;
}

const MEANINGFUL_FREQUENCY_CHANGE_PER_MONTH = 1;
const NOTABLE_GAP_DAYS = 10;

/**
 * The hero "what's happening" insight — deliberately silent most of the
 * time. Fires only for something actually worth a headline: a fresh
 * personal best, a currently-open gap of 10+ days since the last session,
 * or a meaningful (≥1 session/month) frequency shift. A flat "you averaged
 * N sessions/month" restates what the frequency chart and "what changed"
 * bullets already show, so it's deliberately NOT surfaced here — the
 * hero should never be the biggest text on the page for an unremarkable
 * baseline number. `asOfDate` flows through to `workoutConsistencySummary` for
 * the same purity reason those functions take it. `unitByExercise` is
 * forwarded to `workoutStatsByExercise` — see its own doc comment.
 */
export function workoutInsight(logs: RawWorkoutLog[], asOfDate: string, unitByExercise: ReadonlyMap<string, WorkoutUnit> = new Map()): WorkoutInsight | null {
  const stats = workoutStatsByExercise(logs, unitByExercise);
  if (stats.length === 0) {
    return {
      headline: "No workout sessions logged yet.",
      detail: "Log a lift below to start tracking progress.",
      tone: "neutral",
    };
  }

  const lastDate = stats.reduce((max, s) => (s.current.date > max ? s.current.date : max), stats[0].current.date);
  const prsToday = stats
    .filter((s) => s.current.date === lastDate && s.entries[s.entries.length - 1].isPR)
    .map((s) => ({ exercise: s.exercise, weightKg: s.current.weightKg, unit: workoutUnitLabel(s.unit) }));

  if (prsToday.length > 0) {
    return {
      headline:
        prsToday.length === 1
          ? `New best on ${prsToday[0].exercise}: ${prsToday[0].weightKg} ${prsToday[0].unit}.`
          : `${prsToday.length} new personal bests logged ${formatWorkoutDate(lastDate)}.`,
      detail:
        prsToday.length === 1 ? `Logged ${formatWorkoutDate(lastDate)}.` : prsToday.map((e) => `${e.exercise}: ${e.weightKg} ${e.unit}`).join(", "),
      tone: "good",
    };
  }

  const consistency = workoutConsistencySummary(logs, asOfDate);
  if (consistency.insufficientData || consistency.recentAvgPerMonth === null) return null;

  if (consistency.currentGapDays !== null && consistency.currentGapDays >= NOTABLE_GAP_DAYS) {
    return {
      headline: `It's been ${consistency.currentGapDays} days since your last logged session.`,
      detail: `You were averaging ${consistency.recentAvgPerMonth} sessions/month before that.`,
      tone: "attention",
    };
  }

  if (
    consistency.priorAvgPerMonth !== null &&
    Math.abs(consistency.recentAvgPerMonth - consistency.priorAvgPerMonth) >= MEANINGFUL_FREQUENCY_CHANGE_PER_MONTH
  ) {
    return {
      headline: `Training frequency ${
        consistency.recentAvgPerMonth > consistency.priorAvgPerMonth ? "increased" : "decreased"
      } from ${consistency.priorAvgPerMonth} to ${consistency.recentAvgPerMonth} sessions/month.`,
      detail: "Compared with the 3 months before.",
      tone: "neutral",
    };
  }

  return null;
}

export interface WorkoutTimelineEntry {
  id: string;
  date: string;
  exercise: WorkoutExercise;
  weightKg: number;
  updatedAt: number;
  isPR: boolean;
}

/** Every logged set across every exercise, most recent first. */
export function workoutTimeline(logs: RawWorkoutLog[]): WorkoutTimelineEntry[] {
  const byExercise = workoutStatsByExercise(logs);
  const out: WorkoutTimelineEntry[] = [];
  for (const s of byExercise) {
    for (const e of s.entries) {
      out.push({ id: e.id, date: e.date, exercise: s.exercise, weightKg: e.weightKg, updatedAt: e.updatedAt, isPR: e.isPR });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.exercise.localeCompare(b.exercise)));
}
