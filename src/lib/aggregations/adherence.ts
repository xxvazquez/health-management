import type { CanonicalEvent } from "@/lib/types";
import type { DayState } from "@/components/charts/AdherenceStrip";
import { trackedCalendarDates } from "./common";

/**
 * Per-day state for one item, for the adherence strip/heatmap views.
 * Matches the same logic as computeItemStats: any globally-active date from
 * the item's first occurrence onward that has no entry for this item is
 * "tracked-not-completed" (a consistent logger's gap means it didn't
 * happen), not "not-tracked" — that label is reserved for days the app
 * wasn't in use at all, or days before the item was ever logged.
 */
export function buildStateByDate(events: CanonicalEvent[], item: string): Map<string, DayState> {
  const itemDates = events.filter((e) => e.item === item).map((e) => e.date).sort();
  if (itemDates.length === 0) return new Map();
  const firstOccurrence = itemDates[0];

  const map = new Map<string, DayState>();
  for (const date of trackedCalendarDates(events)) {
    if (date >= firstOccurrence) map.set(date, "tracked-not-completed");
  }
  for (const e of events) {
    if (e.item !== item) continue;
    map.set(e.date, e.completed ? "completed" : "tracked-not-completed");
  }
  return map;
}
