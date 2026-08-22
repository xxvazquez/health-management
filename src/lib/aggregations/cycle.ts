import type { RawPeriodLog } from "@/lib/types";
import { addDaysToDate, daysBetween } from "./common";

/** A run of consecutive calendar dates logged as a period — one period,
 * derived on the fly from `RawPeriodLog` rows rather than stored as its
 * own range object. A gap of even one day starts a new run — no
 * tolerance for an unlogged day in the middle, so a run's length is
 * always exactly what was recorded. */
export interface PeriodRun {
  startDate: string;
  endDate: string;
  /** Chronological, one per logged day in the run. */
  days: RawPeriodLog[];
}

/** How many of the most recent completed cycles/periods predictions and
 * the Analysis section are based on — recent history predicts the next
 * period far better than an average spanning years of drift, and keeps
 * both sections reading consistent numbers. Uses whatever's available
 * when there's less history than this. */
const RECENT_CYCLES_WINDOW = 6;

export function groupIntoPeriodRuns(logs: RawPeriodLog[]): PeriodRun[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const runs: PeriodRun[] = [];
  for (const log of sorted) {
    const current = runs.at(-1);
    if (current && daysBetween(current.endDate, log.date) <= 1) {
      current.endDate = log.date;
      current.days.push(log);
    } else {
      runs.push({ startDate: log.date, endDate: log.date, days: [log] });
    }
  }
  return runs;
}

/** Days between the start of each run and the start of the next — the
 * definition of "cycle length" used throughout this module. One shorter
 * than `runs.length` since the most recent run has no "next start" yet. */
export function cycleLengthsFromRuns(runs: PeriodRun[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < runs.length - 1; i++) {
    lengths.push(daysBetween(runs[i].startDate, runs[i + 1].startDate));
  }
  return lengths;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface CurrentCycleStatus {
  /** Days since the most recent period's start, day 1 = that start date.
   * Null when there's no recorded period on or before the target date. */
  cycleDay: number | null;
  /** Set only when the target date falls inside a period run — day 1 = the
   * run's own start. */
  periodDay: number | null;
  onPeriod: boolean;
  /** The run the target date belongs to, if `onPeriod`. */
  currentRun: PeriodRun | null;
}

/** What "today" (or whatever date the Log page has selected) looks like
 * against the recorded history — the numbers the Current Cycle section
 * shows, and the basis for its "on period" toggle. */
export function currentCycleStatus(runs: PeriodRun[], forDate: string): CurrentCycleStatus {
  const currentRun = runs.find((r) => forDate >= r.startDate && forDate <= r.endDate) ?? null;
  const mostRecentStart = [...runs].reverse().find((r) => r.startDate <= forDate)?.startDate ?? null;
  return {
    cycleDay: mostRecentStart ? daysBetween(mostRecentStart, forDate) + 1 : null,
    periodDay: currentRun ? daysBetween(currentRun.startDate, forDate) + 1 : null,
    onPeriod: currentRun !== null,
    currentRun,
  };
}

export interface PredictedPeriod {
  /** The single most likely start date — the median recent cycle length
   * applied forward from the last recorded period start. */
  expectedStart: string;
  /** The earliest/latest a period has started within the recent window,
   * applied the same way — the uncertainty band, not a second guess. */
  earliestStart: string;
  latestStart: string;
  expectedLength: number;
}

/**
 * Projects the next `count` periods forward from the most recent recorded
 * one, using the median cycle length and period length over the last
 * `RECENT_CYCLES_WINDOW` cycles (or everything available, if less) —
 * median rather than mean so one unusually long or short cycle doesn't
 * skew every prediction after it. Returns an empty array when there's no
 * recorded period to project from at all.
 */
export function predictUpcomingPeriods(runs: PeriodRun[], count = 3): PredictedPeriod[] {
  if (runs.length === 0) return [];
  const lastStart = runs.at(-1)!.startDate;
  const allCycleLengths = cycleLengthsFromRuns(runs);
  const recentCycleLengths = allCycleLengths.slice(-RECENT_CYCLES_WINDOW);
  const recentPeriodLengths = runs.slice(-RECENT_CYCLES_WINDOW).map((r) => daysBetween(r.startDate, r.endDate) + 1);

  // No completed cycle yet (a single logged period) — nothing to base a
  // cycle length on, so no prediction rather than a made-up default.
  if (recentCycleLengths.length === 0) return [];

  const typicalCycle = Math.round(median(recentCycleLengths));
  const minCycle = Math.min(...recentCycleLengths);
  const maxCycle = Math.max(...recentCycleLengths);
  const typicalPeriodLength = Math.round(median(recentPeriodLengths)) || 5;

  const predictions: PredictedPeriod[] = [];
  for (let i = 1; i <= count; i++) {
    predictions.push({
      expectedStart: addDaysToDate(lastStart, typicalCycle * i),
      earliestStart: addDaysToDate(lastStart, minCycle * i),
      latestStart: addDaysToDate(lastStart, maxCycle * i),
      expectedLength: typicalPeriodLength,
    });
  }
  return predictions;
}

export interface CycleAnalysis {
  /** The most recently completed cycle's length — distinct from the
   * average below, so a cycle that's currently running long (or short)
   * is visible on its own, not smoothed away. Null with fewer than 2
   * recorded periods. */
  lastCycleLength: number | null;
  averageCycleLength: number | null;
  /** Standard deviation over the same recent window as the average —
   * "how much your cycle actually varies", not a claim about any single
   * future cycle. */
  cycleLengthVariation: number | null;
  averagePeriodLength: number | null;
  cyclesAnalyzed: number;
  periodsAnalyzed: number;
}

export function cycleAnalysis(runs: PeriodRun[]): CycleAnalysis {
  const allCycleLengths = cycleLengthsFromRuns(runs);
  const recentCycleLengths = allCycleLengths.slice(-RECENT_CYCLES_WINDOW);
  const recentPeriodLengths = runs.slice(-RECENT_CYCLES_WINDOW).map((r) => daysBetween(r.startDate, r.endDate) + 1);

  return {
    lastCycleLength: allCycleLengths.at(-1) ?? null,
    averageCycleLength: recentCycleLengths.length > 0 ? Math.round(mean(recentCycleLengths) * 10) / 10 : null,
    cycleLengthVariation: recentCycleLengths.length > 1 ? Math.round(stddev(recentCycleLengths) * 10) / 10 : null,
    averagePeriodLength: recentPeriodLengths.length > 0 ? Math.round(mean(recentPeriodLengths) * 10) / 10 : null,
    cyclesAnalyzed: recentCycleLengths.length,
    periodsAnalyzed: recentPeriodLengths.length,
  };
}
