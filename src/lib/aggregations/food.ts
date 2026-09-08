import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, daysBetween, getDatasetSpan, pct, type DateRange } from "./common";
import { nutritionGroupsForFood, type NutritionGroupId } from "@/taxonomy/nutritionGroups";
import type { GroupState } from "./nutritionPriorities";

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
  // Categories are user-editable now (Manage page), so this reads whatever
  // actually shows up in the data rather than a fixed list — a category
  // with zero logged history just doesn't produce a row, same as every
  // other type's category distribution already behaves.
  const known = Array.from(byCategory.entries()).map(([category, bucket]) => ({
    category,
    count: bucket.count,
    uniqueFoods: bucket.items.size,
    sharePct: pct(bucket.count, total),
  }));
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

export interface IngredientDiversity {
  current: number;
  /** Unique-food count over the equivalent-length period immediately
   * preceding the selected range — null (never fabricated) when the
   * dataset doesn't actually go back that far. */
  previous: number | null;
}

/** Unique ingredients logged in the selected range, plus the same
 * comparison for the prior equivalent-length period when the data covers
 * it. `allEvents` (unfiltered) is needed because the prior period sits
 * outside the caller's already-range-filtered event list. */
export function ingredientDiversity(filtered: CanonicalEvent[], range: DateRange, allEvents: CanonicalEvent[]): IngredientDiversity {
  const current = new Set(foodEvents(filtered).map((e) => e.item)).size;

  const spanDays = daysBetween(range.start, range.end) + 1;
  const prevEnd = addDaysToDate(range.start, -1);
  const prevStart = addDaysToDate(prevEnd, -(spanDays - 1));

  const datasetSpan = getDatasetSpan(allEvents);
  if (!datasetSpan || prevStart < datasetSpan.start) return { current, previous: null };

  const prevFoods = foodEvents(allEvents).filter((e) => e.date >= prevStart && e.date <= prevEnd);
  return { current, previous: new Set(prevFoods.map((e) => e.item)).size };
}

type RepetitionTag = "beneficial" | "worth-noting" | "neutral";

export interface RepetitionEntry {
  item: string;
  count: number;
  shareOfOccurrences: number;
  mealInstanceCount: number;
  tag: RepetitionTag;
}

const DOMINANT_SHARE_THRESHOLD = 15;

/**
 * Most-repeated ingredients, each tagged by whether the repetition itself
 * is worth a second look — never by frequency alone. A food is "beneficial"
 * (repetition is fine, full stop) whenever any of its nutrition groups is
 * already "good"/"strong" in `groupStates`, regardless of what else is
 * happening elsewhere in the diet — that's a separate, already-surfaced
 * concern (the Overview balance card), not this item's
 * fault. Only an item with no such backing, that also dominates total
 * occurrences, gets "worth-noting" — and only when `hasCoreGaps` is true
 * (some other core-pillar group is actually missing), so a dominant but
 * otherwise unremarkable food doesn't get flagged just for being common.
 */
export function repetitionInsights(
  ranked: FoodRankEntry[],
  instances: MealInstance[],
  groupStates: GroupState[],
  hasCoreGaps: boolean,
  topN = 8,
  overrides: Record<string, NutritionGroupId> = {},
): RepetitionEntry[] {
  const totalOccurrences = ranked.reduce((sum, r) => sum + r.count, 0);
  const statusByGroup = new Map(groupStates.map((s) => [s.group, s.status]));

  return ranked.slice(0, topN).map((r) => {
    const shareOfOccurrences = pct(r.count, totalOccurrences);
    const mealInstanceCount = instances.filter((i) => i.items.includes(r.item)).length;
    const groups = nutritionGroupsForFood(r.item, overrides);
    const beneficial = groups.some((g) => {
      const status = statusByGroup.get(g);
      return status === "good" || status === "strong";
    });

    let tag: RepetitionTag = "neutral";
    if (beneficial) tag = "beneficial";
    else if (hasCoreGaps && shareOfOccurrences >= DOMINANT_SHARE_THRESHOLD) tag = "worth-noting";

    return { item: r.item, count: r.count, shareOfOccurrences, mealInstanceCount, tag };
  });
}

type MealTypeClassification = "exclusive" | "cross-meal" | "spread";

export interface MealTypeBreakdownRow {
  item: string;
  countsByMeal: Record<string, number>;
  total: number;
  classification: MealTypeClassification;
  exclusiveMeal: string | null;
}

const MEAL_EXCLUSIVE_THRESHOLD = 0.8;

/** Per top ingredient, how its occurrences split across meal tags — feeds
 * the compact meal-type table. Reuses the already-computed `mealInstances`
 * list rather than re-deriving anything from raw events. */
export function mealTypeIngredientBreakdown(instances: MealInstance[], topItems: string[]): MealTypeBreakdownRow[] {
  return topItems.map((item) => {
    const countsByMeal: Record<string, number> = {};
    let total = 0;
    for (const instance of instances) {
      if (!instance.items.includes(item)) continue;
      countsByMeal[instance.mealTag] = (countsByMeal[instance.mealTag] ?? 0) + 1;
      total++;
    }

    let classification: MealTypeClassification = "spread";
    let exclusiveMeal: string | null = null;
    if (total > 0) {
      const [topMeal, topCount] = Object.entries(countsByMeal).sort((a, b) => b[1] - a[1])[0];
      if (topCount / total >= MEAL_EXCLUSIVE_THRESHOLD) {
        classification = "exclusive";
        exclusiveMeal = topMeal;
      } else if (Object.keys(countsByMeal).length >= 2) {
        classification = "cross-meal";
      }
    }

    return { item, countsByMeal, total, classification, exclusiveMeal };
  });
}

export type VarietyTrendDirection = "increasing" | "decreasing" | "stable";

/**
 * Whether rolling 30-day ingredient variety is trending up, down, or flat —
 * compares the mean of the most recent points to the mean of the equal-size
 * window before that, ignoring differences under 5% as noise. Requires at
 * least `sampleSize * 2` points; anything shorter reports "stable" rather
 * than reading a trend into too little data.
 */
export function varietyTrendDirection(series: DailyVarietyPoint[], sampleSize = 4): VarietyTrendDirection {
  if (series.length < sampleSize * 2) return "stable";
  const recent = series.slice(-sampleSize);
  const prior = series.slice(-sampleSize * 2, -sampleSize);
  const avg = (pts: DailyVarietyPoint[]) => pts.reduce((sum, p) => sum + p.rolling30dUniqueFoods, 0) / pts.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  const diff = recentAvg - priorAvg;
  const threshold = Math.max(1, priorAvg * 0.05);
  if (diff > threshold) return "increasing";
  if (diff < -threshold) return "decreasing";
  return "stable";
}

export interface StapleEntry {
  item: string;
  /** Distinct days logged within the selected range. */
  daysInRange: number;
  rangeLengthDays: number;
  /** `daysInRange / rangeLengthDays`, 0–100, rounded. */
  percent: number;
}

export interface FallenOutEntry {
  item: string;
  /** Distinct days logged in the equal-length period immediately before
   * the selected range. */
  daysBefore: number;
  /** Distinct days logged within the selected range — near-zero, by
   * definition, for anything in this list. */
  daysInRange: number;
}

const STAPLE_MIN_PERCENT = 30;
const FALLEN_OUT_MIN_DAYS_BEFORE = 3;
const FALLEN_OUT_MAX_DAYS_IN_RANGE = 1;

/**
 * Ingredient-level consistency — the finer-grained, no-taxonomy counterpart
 * to the Overview's pillar-level "Diet balance" card. **Staples** are foods
 * logged on a real share of days within the selected range. Foods that have
 * **fallen out of rotation** were logged regularly in the equal-length
 * period immediately before the range but are now rarely or never logged —
 * the "I used to eat this and stopped" angle the pillar/group-level view
 * can't surface. Same before/after-range comparison
 * computeNutritionPriorities's `trend` section already uses, applied per
 * ingredient instead of per nutrition group. `fallenOutOfRotation` is empty
 * when the dataset doesn't extend back far enough for that comparison
 * (never fabricated), same guard as `trend`.
 */
export function ingredientRotation(
  events: CanonicalEvent[],
  range: DateRange,
  staplesTopN = 8,
  fallenOutTopN = 8,
): { staples: StapleEntry[]; fallenOutOfRotation: FallenOutEntry[] } {
  const foods = foodEvents(events);
  const rangeLengthDays = daysBetween(range.start, range.end) + 1;
  const inRangeFoods = foods.filter((e) => e.date >= range.start && e.date <= range.end);

  const daysByItem = (list: CanonicalEvent[]) => {
    const byItem = new Map<string, Set<string>>();
    for (const e of list) {
      const set = byItem.get(e.item) ?? new Set<string>();
      set.add(e.date);
      byItem.set(e.item, set);
    }
    return byItem;
  };

  const daysInRangeByItem = daysByItem(inRangeFoods);

  const staples: StapleEntry[] = Array.from(daysInRangeByItem.entries())
    .map(([item, days]) => ({ item, daysInRange: days.size, rangeLengthDays, percent: pct(days.size, rangeLengthDays) }))
    .filter((s) => s.percent >= STAPLE_MIN_PERCENT)
    .sort((a, b) => b.percent - a.percent || a.item.localeCompare(b.item))
    .slice(0, staplesTopN);

  const span = getDatasetSpan(events);
  const prevEnd = addDaysToDate(range.start, -1);
  const prevStart = addDaysToDate(prevEnd, -(rangeLengthDays - 1));
  const trendAvailable = span !== null && prevStart >= span.start;

  let fallenOutOfRotation: FallenOutEntry[] = [];
  if (trendAvailable) {
    const beforeFoods = foods.filter((e) => e.date >= prevStart && e.date <= prevEnd);
    fallenOutOfRotation = Array.from(daysByItem(beforeFoods).entries())
      .map(([item, days]) => ({ item, daysBefore: days.size, daysInRange: daysInRangeByItem.get(item)?.size ?? 0 }))
      .filter((f) => f.daysBefore >= FALLEN_OUT_MIN_DAYS_BEFORE && f.daysInRange <= FALLEN_OUT_MAX_DAYS_IN_RANGE)
      .sort((a, b) => b.daysBefore - a.daysBefore || a.item.localeCompare(b.item))
      .slice(0, fallenOutTopN);
  }

  return { staples, fallenOutOfRotation };
}
