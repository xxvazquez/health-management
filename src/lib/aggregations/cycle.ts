import type { RawPeriodLog } from "@/lib/types";
import type { CheckIn } from "@/lib/supabase/checkins";
import { addDaysToDate, daysBetween } from "./common";

/** A run of logged period dates — one period, derived on the fly from
 * `RawPeriodLog` rows rather than stored as its own range object. A single
 * unlogged day inside a period is treated as forgotten and bridged; two or
 * more start a new run. */
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
    if (current && daysBetween(current.endDate, log.date) <= 2) {
      current.endDate = log.date;
      current.days.push(log);
    } else {
      runs.push({ startDate: log.date, endDate: log.date, days: [log] });
    }
  }
  return runs;
}

export type CyclePhase = "Menstrual" | "Follicular" | "Ovulation" | "Luteal";

/** Longer than this between two period starts is treated as a logging gap. */
const MAX_PHASE_CYCLE_DAYS = 45;

/**
 * The phase of every day inside a completed cycle: logged period days are
 * menstrual, the three days centred 14 days before the next start are
 * ovulation, with follicular before and luteal after. The current cycle
 * (no next start yet) and gap-sized cycles are left out.
 */
export function cyclePhaseByDate(runs: PeriodRun[]): Map<string, CyclePhase> {
  const phases = new Map<string, CyclePhase>();
  for (let i = 0; i < runs.length - 1; i++) {
    const run = runs[i];
    const nextStart = runs[i + 1].startDate;
    if (daysBetween(run.startDate, nextStart) > MAX_PHASE_CYCLE_DAYS) continue;
    const ovulation = addDaysToDate(nextStart, -14);
    for (let d = run.startDate; d < nextStart; d = addDaysToDate(d, 1)) {
      const fromOvulation = daysBetween(ovulation, d);
      phases.set(d, d <= run.endDate ? "Menstrual" : Math.abs(fromOvulation) <= 1 ? "Ovulation" : fromOvulation < 0 ? "Follicular" : "Luteal");
    }
  }
  return phases;
}

export interface PhaseCheckIns {
  phase: CyclePhase;
  /** Check-ins that fell in this phase. */
  days: number;
  /** Average 1–5, or null with fewer than 3 ratings. */
  mood: number | null;
  energy: number | null;
}

const MIN_PHASE_RATINGS = 3;

/** Average mood and energy per cycle phase, over completed cycles. */
export function checkInsByPhase(runs: PeriodRun[], checkIns: CheckIn[]): PhaseCheckIns[] {
  const phases = cyclePhaseByDate(runs);
  const order: CyclePhase[] = ["Menstrual", "Follicular", "Ovulation", "Luteal"];
  const avg = (values: number[]) => (values.length >= MIN_PHASE_RATINGS ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);
  return order.map((phase) => {
    const inPhase = checkIns.filter((c) => phases.get(c.date) === phase);
    return {
      phase,
      days: inPhase.length,
      mood: avg(inPhase.flatMap((c) => (c.mood == null ? [] : [c.mood]))),
      energy: avg(inPhase.flatMap((c) => (c.energy == null ? [] : [c.energy]))),
    };
  });
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

/** Shorter than this between two period starts is a logging slip, not a cycle. */
const MIN_CYCLE_DAYS = 15;
/** This many times the usual length or more looks like a missed period log. */
const MISSED_PERIOD_FACTOR = 1.75;

/** Whether a cycle length looks like a logging gap rather than a real
 * cycle: under 15 days, or (with at least 3 cycles to judge by) about
 * twice the median. */
export function isGapCycle(length: number, allLengths: number[]): boolean {
  if (length < MIN_CYCLE_DAYS) return true;
  return allLengths.length >= 3 && length >= MISSED_PERIOD_FACTOR * median(allLengths);
}

/** Cycle lengths with logging gaps left out — what averages, variation
 * and predictions are based on. */
function reliableCycleLengths(runs: PeriodRun[]): number[] {
  const lengths = cycleLengthsFromRuns(runs);
  return lengths.filter((l) => !isGapCycle(l, lengths));
}

/** The recent runs' own lengths (days), for period-length averages/medians
 * — EXCLUDING the last run when it's still in progress as of `today` (i.e.
 * `today` falls within its start/end range), same reasoning
 * `cycleLengthsFromRuns` already applies to the last run's CYCLE length
 * ("no next start yet"): a period that might still gain more logged days
 * doesn't have a final length yet either, so counting it as a completed
 * data point would understate the real average/typical length (and, via
 * `predictUpcomingPeriods`, shrink the predicted-period calendar band) for
 * as long as it's still being logged. */
function recentPeriodLengths(runs: PeriodRun[], today: string): number[] {
  const lastRun = runs.at(-1);
  const lastRunInProgress = !!lastRun && today >= lastRun.startDate && today <= lastRun.endDate;
  const closedRuns = lastRunInProgress ? runs.slice(0, -1) : runs;
  return closedRuns.slice(-RECENT_CYCLES_WINDOW).map((r) => daysBetween(r.startDate, r.endDate) + 1);
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
 * recorded period to project from at all. `today` is used only to exclude
 * a still-in-progress last period from the period-length median — see
 * `recentPeriodLengths`'s own comment.
 */
export function predictUpcomingPeriods(runs: PeriodRun[], count: number, today: string): PredictedPeriod[] {
  if (runs.length === 0) return [];
  const lastStart = runs.at(-1)!.startDate;
  const recentCycleLengths = reliableCycleLengths(runs).slice(-RECENT_CYCLES_WINDOW);

  // No completed cycle yet (a single logged period) — nothing to base a
  // cycle length on, so no prediction rather than a made-up default.
  if (recentCycleLengths.length === 0) return [];

  const typicalCycle = Math.round(median(recentCycleLengths));
  const minCycle = Math.min(...recentCycleLengths);
  const maxCycle = Math.max(...recentCycleLengths);
  const typicalPeriodLength = Math.round(median(recentPeriodLengths(runs, today))) || 5;

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
  /** The median over the same window, rounded — the length predictions
   * use, so it's the one figure shown beside them. */
  typicalCycleLength: number | null;
  /** Standard deviation over the same recent window as the average —
   * "how much your cycle actually varies", not a claim about any single
   * future cycle. */
  cycleLengthVariation: number | null;
  averagePeriodLength: number | null;
  cyclesAnalyzed: number;
  periodsAnalyzed: number;
}

export function cycleAnalysis(runs: PeriodRun[], today: string): CycleAnalysis {
  const allCycleLengths = cycleLengthsFromRuns(runs);
  const recentCycleLengths = reliableCycleLengths(runs).slice(-RECENT_CYCLES_WINDOW);
  const recentLengths = recentPeriodLengths(runs, today);

  return {
    lastCycleLength: allCycleLengths.at(-1) ?? null,
    averageCycleLength: recentCycleLengths.length > 0 ? Math.round(mean(recentCycleLengths) * 10) / 10 : null,
    typicalCycleLength: recentCycleLengths.length > 0 ? Math.round(median(recentCycleLengths)) : null,
    cycleLengthVariation: recentCycleLengths.length > 1 ? Math.round(stddev(recentCycleLengths) * 10) / 10 : null,
    averagePeriodLength: recentLengths.length > 0 ? Math.round(mean(recentLengths) * 10) / 10 : null,
    cyclesAnalyzed: recentCycleLengths.length,
    periodsAnalyzed: recentLengths.length,
  };
}

/** How many days past the expected next period start `today` is — null
 * while on a period, before any prediction exists, or before the expected
 * date has actually passed. Read by the Cycle analytics page's delayed-
 * period banner; deliberately computed from the FULL history (every call
 * site passes unfiltered runs), never a date-range-limited one, since "is
 * my period late right now" has only one right answer regardless of what
 * range a chart happens to be showing. */
export function periodDelayDays(predictions: PredictedPeriod[], today: string, onPeriod: boolean): number | null {
  if (onPeriod || predictions.length === 0) return null;
  const next = predictions[0];
  if (today <= next.expectedStart) return null;
  return daysBetween(next.expectedStart, today);
}

export interface CycleHistoryEntry {
  start: string;
  /** Last day before the next period, or today for the cycle in progress. */
  end: string;
  periodDays: number;
  /** Days so far for the current cycle. */
  length: number;
  current: boolean;
  /** Looks like a missed period log rather than a real cycle (`isGapCycle`). */
  gap: boolean;
}

/** Every cycle, newest first: each period start up to the day before the
 * next, and the one in progress up to today. */
export function cycleHistory(runs: PeriodRun[], today: string): CycleHistoryEntry[] {
  const lengths = cycleLengthsFromRuns(runs);
  return runs
    .map((run, i) => {
      const next = runs[i + 1];
      const current = !next;
      const end = next ? addDaysToDate(next.startDate, -1) : today;
      return {
        start: run.startDate,
        end,
        periodDays: daysBetween(run.startDate, run.endDate) + 1,
        length: next ? lengths[i] : daysBetween(run.startDate, today) + 1,
        current,
        gap: !current && isGapCycle(lengths[i], lengths),
      };
    })
    .reverse();
}

/** Older logging (pre-2022) was too sparse to trust its lengths. */
const CYCLE_CHART_MIN_DATE = "2022-01-01";
const CYCLE_CHART_MAX = 12;

/** The completed cycles the length chart draws, oldest first: logging gaps
 * and anything before 2022 left out, the latest twelve at most. */
export function cycleChartEntries(history: CycleHistoryEntry[]): CycleHistoryEntry[] {
  return history
    .filter((c) => !c.current && !c.gap && c.start >= CYCLE_CHART_MIN_DATE)
    .slice(0, CYCLE_CHART_MAX)
    .reverse();
}
