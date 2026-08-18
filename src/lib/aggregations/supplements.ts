import type { CanonicalEvent } from "@/lib/types";
import { SUPPLEMENT_CATEGORIES } from "@/taxonomy/categories";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, summarizeDrift, type DriftSummary, type PersonalChangeSummary } from "./insights";

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
