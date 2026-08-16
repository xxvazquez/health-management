import type { CanonicalEvent } from "@/lib/types";
import { SUPPLEMENT_CATEGORIES } from "@/taxonomy/categories";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";

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
