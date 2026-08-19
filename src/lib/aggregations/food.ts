import type { CanonicalEvent } from "@/lib/types";
import { FOOD_CATEGORIES } from "@/taxonomy/categories";
import { addDaysToDate, pct } from "./common";

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

export interface MealComboEntry {
  mealTag: string;
  /** Sorted, always at least 2 items — the exact set logged together. */
  items: string[];
  count: number;
}

const MIN_COMBO_COUNT = 2;

/**
 * The exact multi-ingredient sets that recur together within the same meal
 * instance (one date + meal tag) — "what do I most commonly eat together
 * for breakfast/lunch/dinner/snack", not a ranking of individual foods and
 * not just pairs. Two meal instances count as the same combination only
 * when they share the exact same set of items; a combination needs at
 * least 2 ingredients, and to have recurred at least `minCount` times, to
 * count as a favorite rather than a one-off.
 *
 * Takes already-computed `MealInstance[]` rather than raw events so a
 * caller that also needs the instance count/list (the Food page does, for
 * its "not enough meals tagged yet" gate) can compute `mealInstances` once
 * and share it, instead of this function silently re-deriving it internally.
 *
 * Keys each combo by mealTag + JSON-stringified item list rather than a
 * plain `items.join("+")` — item names are free text (any user can rename
 * an item to anything via the Manage page), so a joined string can collide:
 * items `["A+B", "C"]` and `["A", "B+C"]` would otherwise both serialize to
 * "A+B+C" and get merged into one miscounted entry.
 */
export function favoriteCombosByMeal(instances: MealInstance[], minCount = MIN_COMBO_COUNT): MealComboEntry[] {
  const counts = new Map<string, MealComboEntry>();
  for (const instance of instances) {
    if (instance.items.length < 2) continue;
    const items = [...instance.items].sort((a, b) => a.localeCompare(b));
    const key = `${instance.mealTag}|${JSON.stringify(items)}`;
    const entry = counts.get(key) ?? { mealTag: instance.mealTag, items, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return Array.from(counts.values())
    .filter((e) => e.count >= minCount)
    .sort((a, b) => b.count - a.count);
}
