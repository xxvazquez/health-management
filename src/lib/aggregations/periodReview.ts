import type { CanonicalEvent, RawWorkoutLog, RawPeriodLog } from "@/lib/types";
import { filterByDateRange, type DateRange } from "./common";

interface PeriodReviewTotals {
  foodLogs: number;
  uniqueFoods: number;
  /** Distinct trained dates, not a raw set count — same "session" definition workout.ts's own consistency summary uses. */
  workoutSessions: number;
  /** Distinct dates with at least one symptom logged. */
  symptomDays: number;
  periodDays: number;
  notesExchanged: number;
}

export interface PeriodReview {
  hasData: boolean;
  totals: PeriodReviewTotals;
  /** Short, plain descriptive facts about the period — a count or a
   * "most X" fact, never a claim about cause or health significance. Empty
   * when there's nothing worth calling out beyond the totals above. */
  highlights: string[];
}

/**
 * "What happened this week/month" — plain totals plus a couple of
 * descriptive highlights for Overview's Weekly/Monthly Review, scoped to
 * whatever `range` the page hands in (a week or a month, see
 * buildReviewRange). `notesInRange` is a plain count passed in by the
 * caller rather than computed here, since Notes lives in Supabase directly
 * and this module stays free of that dependency, same boundary every other
 * Overview aggregation in this file keeps.
 */
export function buildPeriodReview(
  events: CanonicalEvent[],
  workoutLogs: RawWorkoutLog[],
  periodLogs: RawPeriodLog[],
  range: DateRange,
  notesInRange = 0,
): PeriodReview {
  const foodEvents = filterByDateRange(
    events.filter((e) => e.itemType === "food" && e.completed),
    range,
  );
  const symptomEvents = filterByDateRange(
    events.filter((e) => e.itemType === "outcome" && e.completed),
    range,
  );
  const workoutInRange = filterByDateRange(workoutLogs, range);
  const periodInRange = filterByDateRange(periodLogs, range);

  const totals: PeriodReviewTotals = {
    foodLogs: foodEvents.length,
    uniqueFoods: new Set(foodEvents.map((e) => e.item)).size,
    workoutSessions: new Set(workoutInRange.map((w) => w.date)).size,
    symptomDays: new Set(symptomEvents.map((e) => e.date)).size,
    periodDays: periodInRange.length,
    notesExchanged: notesInRange,
  };

  const hasData = totals.foodLogs + totals.workoutSessions + totals.symptomDays + totals.periodDays + totals.notesExchanged > 0;

  // Only a food-flavoured highlight survives here — the workout / symptom /
  // period "logged on N days" lines were dropped as noise (the review is
  // deliberately food + notes focused now).
  const highlights: string[] = [];
  if (foodEvents.length > 0) {
    const counts = new Map<string, number>();
    for (const e of foodEvents) counts.set(e.item, (counts.get(e.item) ?? 0) + 1);
    const [topFood, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount > 1) highlights.push(`Most logged food: ${topFood} (${topCount}×)`);
  }

  return { hasData, totals, highlights };
}
