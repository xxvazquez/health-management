import type { CanonicalEvent } from "@/lib/types";
import { HABIT_CATEGORIES } from "@/taxonomy/categories";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";

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
