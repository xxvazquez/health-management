import type { CanonicalEvent } from "@/lib/types";
import { HABIT_CATEGORIES } from "@/taxonomy/categories";
import { computeItemStatsForFilter, computeItemTrends, type ItemStats } from "./itemStats";
import { trackedCalendarDates } from "./common";
import { buildPersonalChangeSummary, summarizeDrift, type DriftSummary, type PersonalChangeSummary } from "./insights";

export interface HabitGroup {
  category: string;
  items: ItemStats[];
}

export function habitStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "habit");
}

export function habitsByCategory(events: CanonicalEvent[]): HabitGroup[] {
  const stats = habitStats(events);
  return HABIT_CATEGORIES.map((category) => ({
    category,
    items: stats.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
}

/**
 * "What changed" — the primary Habits-page insight: which tracked habits
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
