import type { CanonicalEvent } from "@/lib/types";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, summarizeDrift, type DriftSummary, type PersonalChangeSummary } from "./insights";

export function supplementStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "supplement");
}

/**
 * One flat list of supplements, most-shifted-from-usual first — same
 * treatment as `habitStatsRanked`. Fiber is left out (it's tracked for
 * its digestive relevance and lives on the Stool dashboard).
 */
export function supplementStatsRanked(events: CanonicalEvent[]): (ItemStats & { shiftPp: number | null })[] {
  const noFiber = events.filter((e) => !(e.itemType === "supplement" && e.category === "Fiber"));
  const trendByItem = new Map(supplementTrends(events).map((t) => [t.item, t]));
  return supplementStats(noFiber)
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
 * "What stands out" — the primary Supplements-page insight. Purely personal
 * longitudinal information: this app doesn't track an explicit dosage
 * regimen, so there's no basis to call any supplement's adherence "good"
 * or "in need of attention" — only to describe how it compares to its own
 * usual pattern. Never a cue to take more or less of anything, and never
 * ranked against a different supplement's consistency.
 */
export function supplementsInsight(events: CanonicalEvent[]): PersonalChangeSummary {
  return buildPersonalChangeSummary(supplementTrends(events), "supplement", "supplements", "Taken");
}

/** "At a glance" numbers for the Supplements page header — same trend data
 * as `supplementsInsight`, summarized as plain counts instead of a sentence. */
export function supplementsAtAGlance(events: CanonicalEvent[]): DriftSummary {
  return summarizeDrift(supplementTrends(events));
}

function supplementTrends(events: CanonicalEvent[]) {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemTrends(
    events.filter((e) => e.itemType === "supplement" && e.category !== "Fiber"),
    activeDates,
  );
}
