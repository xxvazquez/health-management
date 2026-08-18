import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, computeCurrentStreak, pct, trackedCalendarDates } from "./common";

export interface ItemStats {
  item: string;
  category: string;
  subcategory: string;
  unit: string | null;
  daysTracked: number;
  daysCompleted: number;
  consistencyPct: number; // of days tracked, % completed
  currentStreak: number;
  firstTrackedDate: string;
  lastTrackedDate: string;
  /** Identity of the underlying item as of its most recent log — the one to
   * act on for rename/archive. In the rare case a canonical name spans
   * more than one raw item identity, this is the most recently touched one. */
  itemIdentity: string;
  isArchived: boolean;
}

/**
 * Per-item adherence stats (used for supplements, habits, and symptom/stool
 * items — same shape, different item_type filter). Grouped by canonical
 * item name.
 *
 * "Tracked" days are every day in `activeDates` (days the app was used at
 * all) from this item's first-ever logged occurrence onward — not just the
 * days this specific item has its own row. That's a deliberate choice: for
 * a consistent logger, a day with no entry for an item that's otherwise
 * part of their routine means it didn't happen, not "unknown". Days before
 * the item's first occurrence are excluded rather than counted as misses,
 * since the item wasn't necessarily part of the routine yet.
 */
export function computeItemStats(events: CanonicalEvent[], activeDates: string[]): ItemStats[] {
  const byItem = new Map<string, CanonicalEvent[]>();
  for (const e of events) {
    const list = byItem.get(e.item) ?? [];
    list.push(e);
    byItem.set(e.item, list);
  }

  const stats: ItemStats[] = [];
  for (const [item, itemEvents] of byItem) {
    const sorted = [...itemEvents].sort((a, b) => a.date.localeCompare(b.date));
    const firstOccurrence = sorted[0].date;
    const lastOccurrence = sorted[sorted.length - 1].date;
    const completedDates = new Set(sorted.filter((e) => e.completed).map((e) => e.date));
    const trackedDates = activeDates.filter((d) => d >= firstOccurrence);
    const currentStreak = computeCurrentStreak(trackedDates, completedDates);

    const mostRecent = sorted[sorted.length - 1];
    stats.push({
      item,
      category: sorted[0].category,
      subcategory: sorted[0].subcategory,
      unit: sorted[0].unit,
      daysTracked: trackedDates.length,
      daysCompleted: completedDates.size,
      consistencyPct: pct(completedDates.size, trackedDates.length),
      currentStreak,
      firstTrackedDate: firstOccurrence,
      lastTrackedDate: lastOccurrence,
      itemIdentity: mostRecent.itemIdentity,
      isArchived: mostRecent.isArchived,
    });
  }

  return stats.sort((a, b) => b.daysCompleted - a.daysCompleted);
}

/** Convenience wrapper for the common case of filtering events to one slice
 * of the dataset, then computing stats against every date the app was used
 * at all (rather than a caller-chosen date list). */
export function computeItemStatsForFilter(
  events: CanonicalEvent[],
  predicate: (e: CanonicalEvent) => boolean,
): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(events.filter(predicate), activeDates);
}

const TREND_WINDOW_DAYS = 14;

export interface ItemTrend {
  item: string;
  category: string;
  /** Consistency since the item was first tracked — its own "usual" baseline. */
  overallConsistencyPct: number;
  overallTrackedDays: number;
  /** Consistency over the last 14 tracked days only. Null when there isn't
   * enough recent tracked history to judge (item is new, or gap in use). */
  recentConsistencyPct: number | null;
  recentTrackedDays: number;
}

/**
 * Same per-item stats as `computeItemStats`, plus a recent-vs-usual split —
 * the basis for "has this fallen behind its own normal pattern" rather than
 * judging every item against one fixed bar. An item logged 3x/week that's
 * still running 3x/week isn't "behind" just because that's a low number.
 */
export function computeItemTrends(events: CanonicalEvent[], activeDates: string[]): ItemTrend[] {
  const overall = computeItemStats(events, activeDates);
  if (activeDates.length === 0) {
    return overall.map((s) => ({
      item: s.item,
      category: s.category,
      overallConsistencyPct: s.consistencyPct,
      overallTrackedDays: s.daysTracked,
      recentConsistencyPct: null,
      recentTrackedDays: 0,
    }));
  }

  const windowStart = addDaysToDate(activeDates[activeDates.length - 1], -(TREND_WINDOW_DAYS - 1));
  const byItem = new Map<string, CanonicalEvent[]>();
  for (const e of events) {
    const list = byItem.get(e.item) ?? [];
    list.push(e);
    byItem.set(e.item, list);
  }

  return overall.map((stat) => {
    const itemEvents = byItem.get(stat.item) ?? [];
    const completedRecentDates = new Set(itemEvents.filter((e) => e.completed && e.date >= windowStart).map((e) => e.date));
    const recentTrackedDates = activeDates.filter((d) => d >= windowStart && d >= stat.firstTrackedDate);
    const recentConsistencyPct = recentTrackedDates.length > 0 ? pct(completedRecentDates.size, recentTrackedDates.length) : null;

    return {
      item: stat.item,
      category: stat.category,
      overallConsistencyPct: stat.consistencyPct,
      overallTrackedDays: stat.daysTracked,
      recentConsistencyPct,
      recentTrackedDays: recentTrackedDates.length,
    };
  });
}
