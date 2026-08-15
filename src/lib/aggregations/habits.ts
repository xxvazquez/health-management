import type { CanonicalEvent } from "@/lib/types";
import { HABIT_CATEGORIES } from "@/taxonomy/categories";
import { trackedCalendarDates } from "./common";
import { computeItemStats, type ItemStats } from "./itemStats";

export interface HabitGroup {
  category: string;
  items: ItemStats[];
}

export function habitStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.itemType === "habit"),
    activeDates,
  );
}

export function habitsByCategory(events: CanonicalEvent[]): HabitGroup[] {
  const stats = habitStats(events);
  return HABIT_CATEGORIES.map((category) => ({
    category,
    items: stats.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
}
