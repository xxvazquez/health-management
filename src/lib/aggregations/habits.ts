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

/**
 * Grouped by whatever categories actually appear in the data, not just the
 * built-in list — a habit filed under a category a user added themselves
 * (never known to this file) still needs its own group here rather than
 * being silently dropped. Known categories keep their curated order;
 * anything else is appended alphabetically after.
 */
export function habitsByCategory(events: CanonicalEvent[]): HabitGroup[] {
  const stats = habitStats(events);
  const present = new Set(stats.map((s) => s.category));
  const known = HABIT_CATEGORIES.filter((c) => present.has(c));
  const extra = Array.from(present)
    .filter((c) => !(HABIT_CATEGORIES as readonly string[]).includes(c))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra].map((category) => ({
    category,
    items: stats.filter((s) => s.category === category),
  }));
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
