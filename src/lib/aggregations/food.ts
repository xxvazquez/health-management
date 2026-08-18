import type { CanonicalEvent } from "@/lib/types";
import { FOOD_CATEGORIES } from "@/taxonomy/categories";
import { addDaysToDate, isoWeekStart, monthStart, pct } from "./common";

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

export interface MealInstance {
  date: string;
  mealTag: string;
  items: string[];
}

/**
 * Groups food events into "meal instances" — one per (date, mealTag) — the
 * unit every combination/pattern function below operates on. Only events
 * with an explicit meal tag count: most historical (pre-migration) data
 * predates that field, so a meal instance simply doesn't exist for it
 * rather than being guessed at. This means combinations will read sparse
 * on older history and grow more useful as new logs (which always carry a
 * meal tag) accumulate.
 */
export function mealInstances(events: CanonicalEvent[]): MealInstance[] {
  const byKey = new Map<string, { date: string; mealTag: string; items: Set<string> }>();
  for (const e of foodEvents(events)) {
    if (!e.mealTag) continue;
    const key = `${e.date}|${e.mealTag}`;
    const entry = byKey.get(key) ?? { date: e.date, mealTag: e.mealTag, items: new Set<string>() };
    entry.items.add(e.item);
    byKey.set(key, entry);
  }
  return Array.from(byKey.values()).map((e) => ({ date: e.date, mealTag: e.mealTag, items: Array.from(e.items) }));
}

export interface IngredientPairEntry {
  itemA: string;
  itemB: string;
  count: number;
}

const MIN_PAIR_COUNT = 3;

/**
 * Ingredient pairs that co-occurred within the same meal instance at least
 * `minCount` times — a plain description of what's actually eaten
 * together ("recurring combinations"), not a comparison against a
 * baseline (that's what `patterns.ts`'s association engine is for).
 */
export function topIngredientPairs(events: CanonicalEvent[], minCount = MIN_PAIR_COUNT): IngredientPairEntry[] {
  const counts = new Map<string, IngredientPairEntry>();
  for (const instance of mealInstances(events)) {
    const items = [...instance.items].sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const key = `${items[i]}|${items[j]}`;
        const entry = counts.get(key) ?? { itemA: items[i], itemB: items[j], count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
    }
  }
  return Array.from(counts.values())
    .filter((e) => e.count >= minCount)
    .sort((a, b) => b.count - a.count);
}

export interface MealSlotIngredientEntry {
  mealTag: string;
  item: string;
  count: number;
}

/**
 * Top individual ingredients per meal slot (breakfast/lunch/dinner/snack)
 * — "what does a typical breakfast look like" — ranked by how many meal
 * instances of that slot included it.
 */
export function topIngredientsBySlot(events: CanonicalEvent[], limitPerSlot = 5): MealSlotIngredientEntry[] {
  const bySlot = new Map<string, Map<string, number>>();
  for (const instance of mealInstances(events)) {
    const counts = bySlot.get(instance.mealTag) ?? new Map<string, number>();
    for (const item of instance.items) counts.set(item, (counts.get(item) ?? 0) + 1);
    bySlot.set(instance.mealTag, counts);
  }
  const out: MealSlotIngredientEntry[] = [];
  for (const [mealTag, counts] of bySlot) {
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limitPerSlot);
    for (const [item, count] of top) out.push({ mealTag, item, count });
  }
  return out;
}
