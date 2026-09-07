import type { CanonicalEvent } from "@/lib/types";
import type { DayState } from "@/components/charts/AdherenceStrip";

/**
 * Per-day state for one item, for the adherence strip. Binary: a day is
 * "done" only if the item was logged and completed that day; every other
 * day (a gap, or a day before the item was first tracked) is left out and
 * reads as "not logged".
 */
export function buildStateByDate(events: CanonicalEvent[], item: string): Map<string, DayState> {
  const map = new Map<string, DayState>();
  for (const e of events) {
    if (e.item === item && e.completed) map.set(e.date, "done");
  }
  return map;
}
