import type { CanonicalEvent } from "@/lib/types";
import { SUPPLEMENT_CATEGORIES } from "@/taxonomy/categories";
import { trackedCalendarDates } from "./common";
import { computeItemStats, type ItemStats } from "./itemStats";

export interface SupplementGroup {
  category: string;
  items: ItemStats[];
}

export function supplementStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.itemType === "supplement"),
    activeDates,
  );
}

export function supplementsByCategory(events: CanonicalEvent[]): SupplementGroup[] {
  const stats = supplementStats(events);
  return SUPPLEMENT_CATEGORIES.map((category) => ({
    category,
    items: stats.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
}
