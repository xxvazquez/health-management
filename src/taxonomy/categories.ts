/**
 * The analytical taxonomy: item types -> categories -> subcategories.
 * This is the single configurable source of truth for how tracked items
 * get grouped across the whole app. Edit this file (and overrides.json)
 * to reclassify something — nothing else should hard-code category names.
 */

export type ItemType = "food" | "supplement" | "outcome" | "habit";

// Every category below is backed by at least one actually-tracked item in
// overrides.json. For food specifically, the names and groupings started
// from the ZHABITTAG labels the source app used (Veggies, Fruit, Grains,
// Dairy, "Meat & Fish", "Nuts & Seeds", Legumes, Misc) and have since been
// split further where a single bucket was hiding a real distinction: Meat
// and Fish are nutritionally different enough to track separately, plant
// milks aren't dairy, and fats (butter, oils) aren't "misc". Don't add a
// category here speculatively; add it when a real tracked item needs it.
export const FOOD_CATEGORIES = [
  "Veggies",
  "Fruit",
  "Legumes",
  "Grains",
  "Dairy",
  "Dairy Alternatives",
  "Meat",
  "Fish",
  "Nuts & Seeds",
  "Fats",
  "Misc",
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

// Unlike food, the source app tags virtually all of these with one flat
// "Supplements" tag (plus a separate "Creams" tag for the one topical
// item) — it doesn't distinguish a vitamin from a mineral itself. The
// subdivision below adds factual sub-typing (Vitamin D *is* a vitamin,
// Magnesium *is* a mineral) that doesn't contradict any grouping choice
// the app's tags make, so it's kept for dashboard usefulness. "Creams"
// matches the app's own tag name for the topical item.
export const SUPPLEMENT_CATEGORIES = [
  "Vitamins",
  "Minerals",
  "Omega-3",
  "Protein & Amino Acids",
  "Fiber",
  "Digestive Aid",
  "Medication",
  "Creams",
  "Other",
] as const;

export const OUTCOME_CATEGORIES = [
  "Stool",
  "Digestive Symptom",
  "Other Symptom",
] as const;

export const HABIT_CATEGORIES = [
  "Sleep",
  "Movement",
  "Exercise",
  "Meal Timing",
  "Fasting",
  "Nutrition Goal",
  "Dietary Restriction",
  "Eating Patterns",
  "Self-care",
  "Household",
  "Learning",
  "Social",
  "Other",
] as const;

export const CATEGORIES_BY_TYPE: Record<ItemType, readonly string[]> = {
  food: FOOD_CATEGORIES,
  supplement: SUPPLEMENT_CATEGORIES,
  outcome: OUTCOME_CATEGORIES,
  habit: HABIT_CATEGORIES,
};

/**
 * Section accent colors: one fixed hue per top-level item type, used
 * anywhere a whole section/chart needs a single consistent identity color
 * (ranked bars, hero stats) rather than per-category color-coding. Picking
 * a unique hue per *category* would mean 15+ colors on some charts, which
 * is not colorblind-safe at any count past ~8 — so identity within a
 * section comes from the axis label, not the color.
 */
export const TYPE_ACCENT: Record<ItemType, string> = {
  food: "var(--series-1)", // blue
  supplement: "var(--series-2)", // orange
  outcome: "var(--series-8)", // red
  habit: "var(--series-3)", // aqua
};

/**
 * Fixed category -> categorical slot assignment, used only where several
 * categories must share one chart at once (e.g. the food category
 * timeline). 10 of the 11 food categories get their own stable color; Misc
 * deliberately falls through to CATEGORY_SLOT_OTHER (gray) rather than
 * claiming an 11th hue — fitting for the catch-all category, and charts
 * stop being colorblind-safe well before 11 series anyway. Keyed by
 * category identity so a category always gets the same color regardless of
 * which categories happen to be in view.
 */
export const CATEGORY_SLOT: Record<string, string> = {
  Fruit: "var(--series-1)", // green
  Dairy: "var(--series-2)", // blue
  Meat: "var(--series-3)", // purple
  Veggies: "var(--series-6)", // green, distinct from Fruit
  Fish: "var(--series-indigo)", // blue, distinct from Dairy
  Grains: "var(--series-chestnut)", // brown
  "Nuts & Seeds": "var(--series-caramel)", // brown, distinct from Grains
  Fats: "var(--series-mustard)", // mustard
  Legumes: "var(--series-orange)", // orange
  "Dairy Alternatives": "var(--series-slate)", // grey
};
export const CATEGORY_SLOT_OTHER = "var(--series-other)";

export function colorForCategorySlot(category: string): string {
  return CATEGORY_SLOT[category] ?? CATEGORY_SLOT_OTHER;
}
