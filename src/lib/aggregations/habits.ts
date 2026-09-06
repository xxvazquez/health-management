import type { CanonicalEvent } from "@/lib/types";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, summarizeDrift, type DriftSummary, type PersonalChangeSummary } from "./insights";

export function habitStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "habit");
}

/**
 * One flat list of habits, most-shifted-from-usual first — the recent
 * 14-day consistency vs the item's own baseline, biggest swing (either
 * direction) at the top. Items without enough recent history to judge a
 * shift sort by raw consistency, after the ones that do. The category
 * stays on each row as a label rather than becoming a card grouping.
 */
export function habitStatsRanked(events: CanonicalEvent[]): (ItemStats & { shiftPp: number | null })[] {
  const trendByItem = new Map(habitTrends(events).map((t) => [t.item, t]));
  return habitStats(events)
    .map((s) => {
      const t = trendByItem.get(s.item);
      const shiftPp =
        t && t.recentConsistencyPct !== null && t.overallTrackedDays >= 10 && t.recentTrackedDays >= 5
          ? Math.round(t.recentConsistencyPct - t.overallConsistencyPct)
          : null;
      return { ...s, shiftPp };
    })
    .sort((a, b) => {
      const am = a.shiftPp === null ? -1 : Math.abs(a.shiftPp);
      const bm = b.shiftPp === null ? -1 : Math.abs(b.shiftPp);
      if (am !== bm) return bm - am;
      return b.consistencyPct - a.consistencyPct;
    });
}

/**
 * "What stands out" — the primary Habits-page insight: which tracked habits
 * are running above/below their own usual pace recently. Purely personal
 * longitudinal information — habits here have no explicit user-defined
 * target/frequency, so there's no basis to call a change "good" or "needs
 * attention", only to describe it. A habit that's always been occasional
 * isn't "behind" for staying occasional.
 */
export function habitsInsight(events: CanonicalEvent[]): PersonalChangeSummary {
  return buildPersonalChangeSummary(habitTrends(events), "habit", "habits", "Done");
}

/** "At a glance" numbers for the Habits page header — same trend data as
 * `habitsInsight`, summarized as plain counts instead of a sentence. */
export function habitsAtAGlance(events: CanonicalEvent[]): DriftSummary {
  return summarizeDrift(habitTrends(events));
}

function habitTrends(events: CanonicalEvent[]) {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemTrends(
    events.filter((e) => e.itemType === "habit"),
    activeDates,
  );
}
