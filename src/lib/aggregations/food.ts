import type { CanonicalEvent } from "@/lib/types";
import { FOOD_CATEGORIES } from "@/taxonomy/categories";
import { addDaysToDate, isoWeekStart, monthStart, pct, round1 } from "./common";

function foodEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return events.filter((e) => e.itemType === "food" && e.completed);
}

export interface CategoryDistributionEntry {
  category: string;
  count: number;
  uniqueFoods: number;
  sharePct: number;
}

export function foodCategoryDistribution(events: CanonicalEvent[]): CategoryDistributionEntry[] {
  const foods = foodEvents(events);
  const total = foods.length;
  const byCategory = new Map<string, { count: number; items: Set<string> }>();
  for (const e of foods) {
    const bucket = byCategory.get(e.category) ?? { count: 0, items: new Set<string>() };
    bucket.count++;
    bucket.items.add(e.item);
    byCategory.set(e.category, bucket);
  }
  const known = FOOD_CATEGORIES.map((category) => {
    const bucket = byCategory.get(category);
    return {
      category,
      count: bucket?.count ?? 0,
      uniqueFoods: bucket?.items.size ?? 0,
      sharePct: pct(bucket?.count ?? 0, total),
    };
  });
  return known.sort((a, b) => b.count - a.count);
}

export interface FoodRankEntry {
  item: string;
  category: string;
  count: number;
}

export function rankedFoods(events: CanonicalEvent[]): FoodRankEntry[] {
  const foods = foodEvents(events);
  const byItem = new Map<string, FoodRankEntry>();
  for (const e of foods) {
    const entry = byItem.get(e.item) ?? { item: e.item, category: e.category, count: 0 };
    entry.count++;
    byItem.set(e.item, entry);
  }
  return Array.from(byItem.values()).sort((a, b) => b.count - a.count);
}

export interface FoodVarietySummary {
  uniqueFoods: number;
  categoriesRepresented: number;
  totalFoodCategories: number;
  daysWithAnyFoodTracked: number;
}

export function foodVarietySummary(events: CanonicalEvent[]): FoodVarietySummary {
  const foods = foodEvents(events);
  const uniqueFoods = new Set(foods.map((e) => e.item)).size;
  const categoriesRepresented = new Set(foods.map((e) => e.category)).size;
  const daysWithAnyFoodTracked = new Set(foods.map((e) => e.date)).size;
  return {
    uniqueFoods,
    categoriesRepresented,
    totalFoodCategories: FOOD_CATEGORIES.length,
    daysWithAnyFoodTracked,
  };
}

export interface DailyVarietyPoint {
  date: string;
  uniqueFoodsThatDay: number;
  rolling7dUniqueFoods: number;
  rolling30dUniqueFoods: number;
}

/** Daily + rolling-window unique-food-count series, purely descriptive. */
export function foodVarietyOverTime(events: CanonicalEvent[]): DailyVarietyPoint[] {
  const foods = foodEvents(events);
  if (foods.length === 0) return [];

  const byDate = new Map<string, Set<string>>();
  for (const e of foods) {
    const set = byDate.get(e.date) ?? new Set<string>();
    set.add(e.item);
    byDate.set(e.date, set);
  }

  const dates = Array.from(byDate.keys()).sort();
  const points: DailyVarietyPoint[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const window7Start = addDaysToDate(date, -6);
    const window30Start = addDaysToDate(date, -29);
    const set7 = new Set<string>();
    const set30 = new Set<string>();
    for (const d of dates) {
      if (d > date) break;
      if (d >= window30Start) {
        byDate.get(d)!.forEach((f) => set30.add(f));
        if (d >= window7Start) byDate.get(d)!.forEach((f) => set7.add(f));
      }
    }
    points.push({
      date,
      uniqueFoodsThatDay: byDate.get(date)!.size,
      rolling7dUniqueFoods: set7.size,
      rolling30dUniqueFoods: set30.size,
    });
  }

  return points;
}

export type TimelineGranularity = "day" | "week" | "month";

export interface TimelineBucket {
  bucketStart: string;
  categoryCounts: Record<string, number>;
}

export function foodCategoryTimeline(
  events: CanonicalEvent[],
  granularity: TimelineGranularity,
): TimelineBucket[] {
  const foods = foodEvents(events);
  const bucketFn = granularity === "day" ? (d: string) => d : granularity === "week" ? isoWeekStart : monthStart;

  const buckets = new Map<string, Record<string, number>>();
  for (const e of foods) {
    const key = bucketFn(e.date);
    const rec = buckets.get(key) ?? {};
    rec[e.category] = (rec[e.category] ?? 0) + 1;
    buckets.set(key, rec);
  }

  return Array.from(buckets.entries())
    .map(([bucketStart, categoryCounts]) => ({ bucketStart, categoryCounts }))
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

export interface NewFoodEntry {
  item: string;
  category: string;
  firstSeenDate: string;
}

/** Foods in first-tracked order — a simple "new foods introduced over time" view. */
export function newFoodsOverTime(events: CanonicalEvent[]): NewFoodEntry[] {
  const foods = foodEvents(events);
  const firstSeen = new Map<string, NewFoodEntry>();
  for (const e of foods) {
    const existing = firstSeen.get(e.item);
    if (!existing || e.date < existing.firstSeenDate) {
      firstSeen.set(e.item, { item: e.item, category: e.category, firstSeenDate: e.date });
    }
  }
  return Array.from(firstSeen.values()).sort((a, b) => a.firstSeenDate.localeCompare(b.firstSeenDate));
}

export function round(n: number): number {
  return round1(n);
}
