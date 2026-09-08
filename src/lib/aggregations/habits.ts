import type { CanonicalEvent } from "@/lib/types";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, type PersonalChangeSummary } from "./insights";

export function habitStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "habit");
}

/**
 * "What stands out" — the cross-domain Trends Overview reads this: which
 * tracked habits are running above/below their own usual pace recently.
 * Purely personal longitudinal information — habits here have no explicit
 * user-defined target/frequency, so there's no basis to call a change
 * "good" or "needs attention", only to describe it. A habit that's always
 * been occasional isn't "behind" for staying occasional.
 */
export function habitsInsight(events: CanonicalEvent[]): PersonalChangeSummary {
  return buildPersonalChangeSummary(habitTrends(events), "habit", "habits", "Done");
}

function habitTrends(events: CanonicalEvent[]) {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemTrends(
    events.filter((e) => e.itemType === "habit"),
    activeDates,
  );
}
