import type { CanonicalEvent } from "@/lib/types";
import { SUPPLEMENT_CATEGORIES } from "@/taxonomy/categories";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, type PersonalChangeSummary } from "./insights";

export interface SupplementGroup {
  category: string;
  items: ItemStats[];
}

export function supplementStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "supplement");
}

export function supplementsByCategory(events: CanonicalEvent[]): SupplementGroup[] {
  const stats = supplementStats(events);
  return SUPPLEMENT_CATEGORIES.map((category) => ({
    category,
    items: stats.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
}

/**
 * "What changed" — the primary Supplements-page insight. Purely personal
 * longitudinal information: this app doesn't track an explicit dosage
 * regimen, so there's no basis to call any supplement's adherence "good"
 * or "in need of attention" — only to describe how it compares to its own
 * usual pattern. Never a cue to take more or less of anything, and never
 * ranked against a different supplement's consistency.
 */
export function supplementsInsight(events: CanonicalEvent[]): PersonalChangeSummary {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  const trends = computeItemTrends(
    events.filter((e) => e.itemType === "supplement" && e.category !== "Fiber"),
    activeDates,
  );
  return buildPersonalChangeSummary(trends, "supplement", "supplements");
}
