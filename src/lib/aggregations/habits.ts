import type { CanonicalEvent } from "@/lib/types";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";

export function habitStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "habit");
}
