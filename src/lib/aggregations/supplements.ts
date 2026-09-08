import type { CanonicalEvent } from "@/lib/types";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, type PersonalChangeSummary } from "./insights";

export function supplementStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "supplement");
}

/**
 * "What stands out" — the cross-domain Trends Overview reads this. Purely personal
 * longitudinal information: this app doesn't track an explicit dosage
 * regimen, so there's no basis to call any supplement's adherence "good"
 * or "in need of attention" — only to describe how it compares to its own
 * usual pattern. Never a cue to take more or less of anything, and never
 * ranked against a different supplement's consistency.
 */
export function supplementsInsight(events: CanonicalEvent[]): PersonalChangeSummary {
  return buildPersonalChangeSummary(supplementTrends(events), "supplement", "supplements", "Taken");
}

function supplementTrends(events: CanonicalEvent[]) {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemTrends(
    events.filter((e) => e.itemType === "supplement" && e.category !== "Fiber"),
    activeDates,
  );
}
