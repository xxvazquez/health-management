import type { CanonicalEvent } from "@/lib/types";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";

export function supplementStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "supplement");
}
