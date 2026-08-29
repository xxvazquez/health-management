import type { CanonicalEvent, RawWorkoutLog, RawStoolLog, RawPeriodLog } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, trackedCalendarDates } from "./common";
import { supplementsInsight } from "./supplements";
import { habitsInsight } from "./habits";
import { computeNutritionPriorities } from "./nutritionPriorities";
import { generateTopPatterns, type AssociationResult } from "./patterns";
import { generateBristolPatterns } from "./bristolPatterns";
import { workoutConsistencySummary } from "./workout";
import { groupIntoPeriodRuns, cycleAnalysis } from "./cycle";
import type { Bullet } from "./insights";

export interface PersonalTrends {
  insufficientData: boolean;
  /** Every domain's own recent-vs-usual comparison, purely descriptive —
   * never ranked "good" or "bad" against each other, and never used to
   * imply one caused another (that's what topCrossDomainFindings below is
   * for, and even that stays in "occurred more/less often around" phrasing,
   * never "causes"). Capped short on purpose — Overview's Trends section is
   * a handful of useful facts, not a stats page. */
  changed: Bullet[];
}

const MIN_TRACKED_DAYS_FOR_TRENDS = 10;
const CHANGE_COUNT_THRESHOLD = 2;
const MAX_TRENDS = 5;

/**
 * Overview's "Personal Trends" — a short, cross-domain list of what's
 * actually changed recently vs. this person's own history (Food/Workout/
 * Symptoms/Cycle, plus whatever Habits/Supplements drift is notable),
 * reusing each domain's own existing insight engine rather than
 * re-deriving anything. Deliberately excludes Food's evidence-graded
 * "what's well covered / what's a gap" scoring (`computeNutritionPriorities`'s
 * `doingWell`/`topPriorities`) — that's the Food page's own job; folding it
 * in here would duplicate it, not summarize it.
 */
export function buildPersonalTrends(
  events: CanonicalEvent[],
  workoutLogs: RawWorkoutLog[],
  periodLogs: RawPeriodLog[],
  today: string,
): PersonalTrends {
  const span = getDatasetSpan(events);
  const trackedDates = trackedCalendarDates(events);
  if (!span || trackedDates.size < MIN_TRACKED_DAYS_FOR_TRENDS) {
    return { insufficientData: true, changed: [] };
  }

  const habits = habitsInsight(events);
  const supplements = supplementsInsight(events);
  const food = computeNutritionPriorities(events, { start: addDaysToDate(span.end, -29), end: span.end });

  const changed: Bullet[] = [];

  // Deliberately no "logged on N of the last 7 days" / "logged a symptom on
  // N of the last 7 days" bullets — how often you *tracked* isn't a health
  // trend, just tracking-diligence noise, so Trends stays about what the
  // data actually shows.

  const consistency = workoutConsistencySummary(workoutLogs, today);
  if (!consistency.insufficientData && consistency.recentAvgPerMonth !== null && consistency.priorAvgPerMonth !== null) {
    if (Math.abs(consistency.recentAvgPerMonth - consistency.priorAvgPerMonth) >= 1) {
      changed.push({
        label: "Workouts",
        detail: `Averaging ${consistency.recentAvgPerMonth} sessions/month recently, vs. ${consistency.priorAvgPerMonth} before.`,
        compact: `${consistency.recentAvgPerMonth}/mo recently · ${consistency.priorAvgPerMonth}/mo before`,
      });
    }
  }

  const cycle = cycleAnalysis(groupIntoPeriodRuns(periodLogs), today);
  if (cycle.averageCycleLength !== null && cycle.cyclesAnalyzed > 0) {
    changed.push({
      label: "Cycle",
      detail: `Averaging a ${cycle.averageCycleLength}-day cycle over your last ${cycle.cyclesAnalyzed} recorded.`,
      compact: `~${cycle.averageCycleLength}-day cycle`,
    });
  }

  if (!habits.insufficientData && habits.changed.length > 0) changed.push(habits.changed[0]);
  if (!supplements.insufficientData && supplements.changed.length > 0) changed.push(supplements.changed[0]);

  const plantTrend = food.trend.available ? food.trend.points.find((p) => p.label.startsWith("Plant diversity")) : null;
  if (plantTrend && Math.abs(plantTrend.current - plantTrend.previous) >= CHANGE_COUNT_THRESHOLD) {
    changed.push({
      label: "Food variety",
      detail: `Unique plant foods over 30 days: ${plantTrend.previous} → ${plantTrend.current}.`,
      compact: `${plantTrend.previous} → ${plantTrend.current} unique plants`,
    });
  }

  return { insufficientData: false, changed: changed.slice(0, MAX_TRENDS) };
}

const MAX_OVERVIEW_FINDINGS = 4;

/**
 * The strongest cross-domain findings across the whole app — Bristol
 * comparisons plus the general food/supplement/habit/workout-vs-symptom scan —
 * ranked by magnitude and deduped by cause+outcome pair, for a short
 * "what stands out" list on Overview. Reuses `generateBristolPatterns` and
 * `generateTopPatterns` directly rather than re-scanning anything; this is
 * a ranked slice of their combined output, not a separate analysis.
 */
export function topCrossDomainFindings(events: CanonicalEvent[], stoolLogs: RawStoolLog[], workoutLogs: RawWorkoutLog[] = []): AssociationResult[] {
  const combined = [...generateBristolPatterns(events, stoolLogs, workoutLogs), ...generateTopPatterns(events, workoutLogs)].sort(
    (a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct),
  );

  const seen = new Set<string>();
  const deduped: AssociationResult[] = [];
  for (const r of combined) {
    const key = `${r.causeLabel}|${r.outcomeLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= MAX_OVERVIEW_FINDINGS) break;
  }
  return deduped;
}
