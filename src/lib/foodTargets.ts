import type { NutritionGroupId } from "@/taxonomy/nutritionGroups";

/** Every food group that can carry a weekly target, in the order Settings
 * lists them. The first six feed the full nutrition analysis on Trends →
 * Food; the rest are measured as plain times-a-week counts. */
export const TARGET_GROUPS = ["vegetables", "fruit", "legumes", "grains", "nuts_seeds", "fish", "fats", "meat", "poultry", "eggs", "dairy", "sweets"] as const;
export type TargetGroup = (typeof TARGET_GROUPS)[number];

/** The groups the nutrition analysis understands as "eat at least this". */
export const CORE_TARGET_GROUPS = ["vegetables", "fruit", "legumes", "grains", "nuts_seeds", "fish"] as const satisfies readonly TargetGroup[];
export type CoreTargetGroup = (typeof CORE_TARGET_GROUPS)[number];

export const TARGET_LABEL: Record<TargetGroup, string> = {
  vegetables: "Vegetables",
  fruit: "Fruit",
  legumes: "Legumes",
  grains: "Whole grains",
  nuts_seeds: "Nuts & seeds",
  fish: "Fish & seafood",
  meat: "Red & processed meat",
  poultry: "Poultry",
  eggs: "Eggs",
  dairy: "Dairy",
  fats: "Healthy fats",
  sweets: "Ultra-processed",
};

/** What counts toward each group, for the one line under its setting. */
export const TARGET_EXAMPLES: Record<TargetGroup, string> = {
  vegetables: "Leafy greens, broccoli, carrots, onions and the like. Potatoes don't count.",
  fruit: "Any fresh or frozen fruit, berries and citrus included.",
  legumes: "Beans, lentils, chickpeas, peas and tofu.",
  grains: "Oats, buckwheat, brown rice, wholemeal bread. White bread and pasta don't count.",
  nuts_seeds: "A handful of nuts, seeds or nut butter.",
  fish: "Any fish or seafood; salmon, mackerel and herring are the oily ones.",
  fats: "Olive oil, rapeseed oil and avocado.",
  meat: "Beef, pork, lamb, sausage, ham and bacon.",
  poultry: "Chicken and turkey.",
  eggs: "Eggs, however they're cooked.",
  dairy: "Milk, yoghurt, kefir and cheese.",
  sweets: "Sweets, cake, crisps and other ultra-processed snacks.",
};

/** Which nutrition groups a day has to include to count toward a target. */
export const TARGET_NUTRITION_GROUPS: Record<TargetGroup, NutritionGroupId[]> = {
  vegetables: ["leafy_greens", "cruciferous", "red_orange_veg", "alliums", "other_vegetables"],
  fruit: ["berries", "citrus", "other_fruit"],
  legumes: ["legumes"],
  grains: ["whole_grains"],
  nuts_seeds: ["nuts", "seeds"],
  fish: ["fatty_fish", "other_seafood"],
  meat: ["red_meat", "processed_meat"],
  poultry: ["poultry"],
  eggs: ["eggs"],
  dairy: ["fermented_dairy", "dairy_other"],
  fats: ["olive_oil", "other_unsaturated_fat"],
  sweets: ["highly_processed"],
};

/** "At least" (eat it this often), "at most" (keep it under this), or off. */
export type TargetMode = "min" | "max" | "off";
export interface GroupTarget {
  mode: TargetMode;
  perWeek: number;
}

export type Diet = "everything" | "pescatarian" | "vegetarian" | "vegan";

export const DIET_LABEL: Record<Diet, string> = {
  everything: "Everything",
  pescatarian: "Pescatarian",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
};

export const DIETS: Diet[] = ["everything", "pescatarian", "vegetarian", "vegan"];

const min = (perWeek: number): GroupTarget => ({ mode: "min", perWeek });
const max = (perWeek: number): GroupTarget => ({ mode: "max", perWeek });
const off = (perWeek: number): GroupTarget => ({ mode: "off", perWeek });

/** Evidence-based starting points, in meals a week. Vegetables and fruit at
 * two meals a day (benefit keeps rising toward ~800 g/day combined); whole
 * grains at two (~90 g/day is linked to lower mortality); legumes most days
 * and nuts daily (both among the strongest longevity associations); fish
 * twice, one oily; olive oil daily. Red and processed meat capped at three
 * (WCRF); sweets and ultra-processed foods at three. Poultry, eggs and
 * dairy are broadly neutral in the evidence, so they start off. Without
 * fish or meat, legumes and nuts carry more of the protein. */
export const DIET_DEFAULTS: Record<Diet, Record<TargetGroup, GroupTarget>> = {
  everything: { vegetables: min(14), fruit: min(14), legumes: min(5), grains: min(14), nuts_seeds: min(7), fish: min(2), fats: min(7), meat: max(3), poultry: off(3), eggs: off(5), dairy: off(7), sweets: max(3) },
  pescatarian: { vegetables: min(14), fruit: min(14), legumes: min(5), grains: min(14), nuts_seeds: min(7), fish: min(3), fats: min(7), meat: off(0), poultry: off(0), eggs: off(5), dairy: off(7), sweets: max(3) },
  vegetarian: { vegetables: min(14), fruit: min(14), legumes: min(7), grains: min(14), nuts_seeds: min(7), fish: off(0), fats: min(7), meat: off(0), poultry: off(0), eggs: off(5), dairy: off(7), sweets: max(3) },
  vegan: { vegetables: min(14), fruit: min(14), legumes: min(10), grains: min(14), nuts_seeds: min(10), fish: off(0), fats: min(7), meat: off(0), poultry: off(0), eggs: off(0), dairy: off(0), sweets: max(3) },
};

/** Targets count meals (breakfast, lunch, dinner, snack), so four a day. */
export const MAX_TARGET_PER_WEEK = 28;

/** Stored in `user_preferences.prefs.foodTargets`: the chosen diet plus any
 * group the user changed from that diet's default, in meals a week. `perWeek` is the older
 * shape (a number per group, 0 = off), still read for accounts saved
 * before `groups` existed. */
export interface FoodTargetsPref {
  diet?: Diet;
  groups?: Partial<Record<TargetGroup, GroupTarget>>;
  perWeek?: Partial<Record<CoreTargetGroup, number>>;
}

/** Every group's target as the user has it, including those switched off. */
export type AllFoodTargets = Record<TargetGroup, GroupTarget>;

/** The "at least" weekly target of each core group, or null when that
 * group is off or set as a limit — what the nutrition analysis reads. */
export type ResolvedFoodTargets = Record<CoreTargetGroup, number | null>;

function isDiet(value: unknown): value is Diet {
  return typeof value === "string" && (DIETS as string[]).includes(value);
}

export function dietOf(pref: FoodTargetsPref | undefined): Diet {
  return isDiet(pref?.diet) ? pref.diet : "everything";
}

function clampPerWeek(value: number): number {
  return Math.min(MAX_TARGET_PER_WEEK, Math.max(0, Math.round(value)));
}

function savedTarget(pref: FoodTargetsPref | undefined, group: TargetGroup): GroupTarget | null {
  const saved = pref?.groups?.[group];
  if (saved && (saved.mode === "min" || saved.mode === "max" || saved.mode === "off") && Number.isFinite(saved.perWeek)) {
    const perWeek = clampPerWeek(saved.perWeek);
    return { mode: saved.mode !== "off" && perWeek === 0 ? "off" : saved.mode, perWeek };
  }
  const legacy = (pref?.perWeek as Partial<Record<TargetGroup, number>> | undefined)?.[group];
  if (typeof legacy === "number" && Number.isFinite(legacy)) {
    const perWeek = clampPerWeek(legacy);
    return perWeek > 0 ? min(perWeek) : off(DIET_DEFAULTS.everything[group].perWeek);
  }
  return null;
}

export function resolveAllFoodTargets(pref: FoodTargetsPref | undefined): AllFoodTargets {
  const defaults = DIET_DEFAULTS[dietOf(pref)];
  const out = {} as AllFoodTargets;
  for (const group of TARGET_GROUPS) out[group] = savedTarget(pref, group) ?? defaults[group];
  return out;
}

export function resolveFoodTargets(pref: FoodTargetsPref | undefined): ResolvedFoodTargets {
  const all = resolveAllFoodTargets(pref);
  const out = {} as ResolvedFoodTargets;
  for (const group of CORE_TARGET_GROUPS) out[group] = all[group].mode === "min" ? all[group].perWeek : null;
  return out;
}

/** The targets Trends measures as plain counts: every non-core group that's
 * on, plus a core group the user turned into a limit. */
export function extraFoodTargets(pref: FoodTargetsPref | undefined): { group: TargetGroup; mode: "min" | "max"; perWeek: number }[] {
  const all = resolveAllFoodTargets(pref);
  return TARGET_GROUPS.flatMap((group) => {
    const t = all[group];
    if (t.mode === "off") return [];
    if (t.mode === "min" && (CORE_TARGET_GROUPS as readonly string[]).includes(group)) return [];
    return [{ group, mode: t.mode, perWeek: t.perWeek }];
  });
}

export const DEFAULT_FOOD_TARGETS: ResolvedFoodTargets = resolveFoodTargets(undefined);

/** The "at least" defaults the per-subgroup targets are scaled against. */
export const BASE_CORE_TARGETS: Record<CoreTargetGroup, number> = {
  vegetables: 14,
  fruit: 14,
  legumes: 5,
  grains: 14,
  nuts_seeds: 7,
  fish: 2,
};
