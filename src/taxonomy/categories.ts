/**
 * The analytical taxonomy: item types -> categories -> subcategories.
 * This is the single configurable source of truth for how tracked items
 * get grouped across the whole app. Edit this file (and overrides.json)
 * to reclassify something — nothing else should hard-code category names.
 */

export type ItemType = "food" | "supplement" | "outcome" | "habit" | "workout";

// Every category below is backed by at least one actually-tracked item in
// overrides.json. For food specifically, the names and groupings started
// from the ZHABITTAG labels the source app used (Veggies, Fruit, Grains,
// Dairy, "Meat & Fish", "Nuts & Seeds", Legumes, Misc) and have since been
// split further where a single bucket was hiding a real distinction: Meat
// and Fish are nutritionally different enough to track separately, plant
// milks aren't dairy, and fats (butter, oils) aren't "misc". Spices are
// their own bucket so seasonings can be logged without skewing the
// nutrition-priority engine (which ignores the Spices category entirely).
// Don't add a category here speculatively; add it when a real tracked item needs it.
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
  "Spices",
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

// Stool used to live here as a category with a "Bristol Scale"/"Stool
// Quality" subcategory hack — it's now its own first-class log type
// (`stool_logs`, `src/lib/types.ts`), not an outcome/symptom at all.
export const OUTCOME_CATEGORIES = [
  "Digestive Symptom",
  "Other Symptom",
] as const;

// Deliberately just 3 broad groups (not one category per habit type like
// the other item types above) — the goal is a habit's category being
// obvious at a glance, not an exhaustive taxonomy. Food: sugar, fasting,
// meal timing. Body: workout, walk, physiotherapy. Daily: everything else
// routine (read, shower, sleep).
export const HABIT_CATEGORIES = ["Food", "Body", "Daily"] as const;

// Seeded from the 7 fixed lifts this app tracked before exercises became
// user-editable — all genuinely strength work, so they all start under one
// category. Cardio/Flexibility & Mind-Body exist as selectable categories
// from the start (matching examples like running, swimming, yoga, pilates)
// even though nothing's filed under them yet — same "materialize on first
// touch" rule as every other type, not a claim that these are exhaustive.
export const WORKOUT_CATEGORIES = ["Strength Training", "Cardio", "Flexibility & Mind-Body"] as const;

export const CATEGORIES_BY_TYPE: Record<ItemType, readonly string[]> = {
  food: FOOD_CATEGORIES,
  supplement: SUPPLEMENT_CATEGORIES,
  outcome: OUTCOME_CATEGORIES,
  habit: HABIT_CATEGORIES,
  workout: WORKOUT_CATEGORIES,
};

/**
 * The category list actually offered for one item type, taking a user's
 * own customizations (Manage page, Supabase's `categories` table) into
 * account. Every type — food included — works the same way: a type with no
 * rows yet falls back to its built-in default list (`FOOD_CATEGORIES` etc.)
 * purely as a bootstrap seed; the moment any real row exists for that type,
 * the database is the only source of truth and this never falls back to or
 * re-merges the built-in list again. `nutritionGroups.ts` (the actual
 * nutrition-guidance engine) classifies by item name, not by category, so
 * there's nothing here that depends on food's category names staying fixed.
 */
export function effectiveCategoryList(itemType: ItemType, customNames: readonly string[]): readonly string[] {
  return customNames.length > 0 ? customNames : CATEGORIES_BY_TYPE[itemType];
}

/**
 * Section accent colors: one fixed hue per top-level item type, used
 * anywhere a whole section/chart needs a single consistent identity color
 * (ranked bars, hero stats) rather than per-category color-coding. Picking
 * a unique hue per *category* would mean 15+ colors on some charts, which
 * is not colorblind-safe at any count past ~8 — so identity within a
 * section comes from the axis label, not the color.
 */
export const TYPE_ACCENT: Record<ItemType, string> = {
  food: "var(--series-1)", // sage
  supplement: "var(--series-2)", // sky blue
  outcome: "var(--series-8)", // plum
  habit: "var(--series-3)", // lavender
  // Moved off magenta once Notes (Connect) started using that same series
  // for its own accent — the two never share a screen, but a deep
  // teal-green reads distinctly from Notes' pink/magenta at a glance
  // anyway, and previously doubled as --status-serious elsewhere, which a
  // domain accent probably shouldn't share meaning with regardless.
  workout: "var(--series-6)", // deep teal-green
};

/**
 * Fixed category -> categorical slot assignment, used only where several
 * categories must share one chart at once (e.g. the food category
 * timeline). Most food categories get their own stable color; Misc and
 * Spices deliberately fall through to CATEGORY_SLOT_OTHER (gray) rather
 * than claiming another hue — fitting for the catch-all/seasoning
 * categories, and charts stop being colorblind-safe well past 8 series
 * anyway. Keyed by category identity so a category always gets the same
 * color regardless of which categories happen to be in view.
 */
export const CATEGORY_SLOT: Record<string, string> = {
  Fruit: "var(--series-1)", // green
  Dairy: "var(--series-2)", // blue
  Meat: "var(--series-3)", // purple
  Veggies: "var(--series-6)", // green, distinct from Fruit
  Fish: "var(--series-indigo)", // blue, distinct from Dairy
  Grains: "var(--series-4)", // deep rose
  "Nuts & Seeds": "var(--series-8)", // plum, distinct from Grains
  Fats: "var(--series-magenta)", // magenta
  Legumes: "var(--series-berry)", // rose/plum blend
  "Dairy Alternatives": "var(--series-slate)", // grey
};
export const CATEGORY_SLOT_OTHER = "var(--series-other)";

export function colorForCategorySlot(category: string): string {
  return CATEGORY_SLOT[category] ?? CATEGORY_SLOT_OTHER;
}
