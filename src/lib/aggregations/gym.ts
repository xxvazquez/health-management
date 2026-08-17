import { GYM_EXERCISES, type GymExercise, type RawGymLog } from "@/lib/types";
import type { InsightTone } from "./insights";
import { round1 } from "./common";

export function formatGymDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatGymDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface GymEntry {
  id: string;
  date: string;
  weightKg: number;
  updatedAt: number;
  /** True only if this entry beats every earlier entry for this exercise —
   * the very first logged entry is a starting point, not a "record". */
  isPR: boolean;
}

export interface GymExerciseStats {
  exercise: GymExercise;
  /** Ascending by date. */
  entries: GymEntry[];
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
 */
export function gymStatsByExercise(logs: RawGymLog[]): GymExerciseStats[] {
  const out: GymExerciseStats[] = [];
  for (const exercise of GYM_EXERCISES) {
    const sorted = logs
      .filter((l) => l.exercise === exercise)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (sorted.length === 0) continue;

    let runningMax = sorted[0].weightKg;
    const entries: GymEntry[] = sorted.map((l, i) => {
      const isPR = i > 0 && l.weightKg > runningMax;
      if (l.weightKg > runningMax) runningMax = l.weightKg;
      return { id: l.id, date: l.date, weightKg: l.weightKg, updatedAt: l.updatedAt, isPR };
    });

    const started = entries[0];
    const current = entries[entries.length - 1];
    const best = entries.reduce((max, e) => (e.weightKg > max.weightKg ? e : max), entries[0]);

    out.push({
      exercise,
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

export interface GymOverview {
  exercisesTracked: number;
  totalRecords: number;
  /** Count of entries across all history that beat their exercise's prior
   * best — a plain tally from the data, not a recency-windowed score. */
  totalPRs: number;
  mostImproved: { exercise: GymExercise; changePct: number } | null;
}

/**
 * The "very small" overview summary — four facts, no derived score. "Most
 * improved" reuses the same first→current percentage shown in the
 * per-exercise Progress stat, so the overview number and the detail view
 * never disagree about what "progress" means.
 */
export function gymOverview(logs: RawGymLog[]): GymOverview {
  const stats = gymStatsByExercise(logs);
  const totalPRs = stats.reduce((sum, s) => sum + s.entries.filter((e) => e.isPR).length, 0);

  const eligible = stats.filter((s) => s.recordsCount >= 2 && s.changePct !== null);
  const mostImproved =
    eligible.length > 0 ? eligible.reduce((max, s) => (s.changePct! > max.changePct! ? s : max), eligible[0]) : null;

  return {
    exercisesTracked: stats.length,
    totalRecords: logs.length,
    totalPRs,
    mostImproved: mostImproved ? { exercise: mostImproved.exercise, changePct: mostImproved.changePct! } : null,
  };
}

export interface GymInsight {
  insufficientData: boolean;
  headline: string;
  detail: string | null;
  tone: InsightTone;
}

/** "What's new" — whatever was logged most recently, and whether it was a
 * genuine new best. No arbitrary recency window: just the last entry. */
export function gymInsight(logs: RawGymLog[]): GymInsight {
  const stats = gymStatsByExercise(logs);
  if (stats.length === 0) {
    return {
      insufficientData: true,
      headline: "No gym sessions logged yet.",
      detail: "Log a lift below to start tracking progress.",
      tone: "neutral",
    };
  }

  const lastDate = stats.reduce((max, s) => (s.current.date > max ? s.current.date : max), stats[0].current.date);
  const todaysEntries = stats
    .filter((s) => s.current.date === lastDate)
    .map((s) => ({ exercise: s.exercise, weightKg: s.current.weightKg, isPR: s.entries[s.entries.length - 1].isPR }));
  const prsToday = todaysEntries.filter((e) => e.isPR);

  if (prsToday.length === 0) {
    return {
      insufficientData: false,
      headline: `Most recently logged ${formatGymDate(lastDate)}.`,
      detail: todaysEntries.map((e) => `${e.exercise}: ${e.weightKg} kg`).join(", "),
      tone: "neutral",
    };
  }

  return {
    insufficientData: false,
    headline:
      prsToday.length === 1
        ? `New best on ${prsToday[0].exercise}: ${prsToday[0].weightKg} kg.`
        : `${prsToday.length} new personal bests logged ${formatGymDate(lastDate)}.`,
    detail: prsToday.length === 1 ? `Logged ${formatGymDate(lastDate)}.` : prsToday.map((e) => `${e.exercise}: ${e.weightKg} kg`).join(", "),
    tone: "good",
  };
}

export interface GymTimelineEntry {
  id: string;
  date: string;
  exercise: GymExercise;
  weightKg: number;
  updatedAt: number;
  isPR: boolean;
}

/** Every logged set across every exercise, most recent first. */
export function gymTimeline(logs: RawGymLog[]): GymTimelineEntry[] {
  const byExercise = gymStatsByExercise(logs);
  const out: GymTimelineEntry[] = [];
  for (const s of byExercise) {
    for (const e of s.entries) {
      out.push({ id: e.id, date: e.date, exercise: s.exercise, weightKg: e.weightKg, updatedAt: e.updatedAt, isPR: e.isPR });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.exercise.localeCompare(b.exercise)));
}
