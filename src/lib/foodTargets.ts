import { PILLAR_LABEL, type PillarId } from "@/taxonomy/nutritionGroups";

/** The food groups that carry a weekly target, in the order Settings and
 * Trends list them. */
export const TARGET_PILLARS = ["vegetables", "fruit", "legumes", "grains", "nuts_seeds", "fish"] as const satisfies readonly PillarId[];
export type TargetPillar = (typeof TARGET_PILLARS)[number];

export type Diet = "everything" | "pescatarian" | "vegetarian" | "vegan";

export const DIET_LABEL: Record<Diet, string> = {
  everything: "Everything",
  pescatarian: "Pescatarian",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
};

export const DIETS: Diet[] = ["everything", "pescatarian", "vegetarian", "vegan"];

/** Times a week per group; 0 means the group is left out. Guideline-based:
 * vegetables, fruit and whole grains most days, nuts 5×, legumes 3×, fatty
 * fish 2×. Without fish, legumes and nuts take over more of the protein. */
export const DIET_DEFAULTS: Record<Diet, Record<TargetPillar, number>> = {
  everything: { vegetables: 7, fruit: 7, legumes: 3, grains: 7, nuts_seeds: 5, fish: 2 },
  pescatarian: { vegetables: 7, fruit: 7, legumes: 3, grains: 7, nuts_seeds: 5, fish: 2 },
  vegetarian: { vegetables: 7, fruit: 7, legumes: 5, grains: 7, nuts_seeds: 7, fish: 0 },
  vegan: { vegetables: 7, fruit: 7, legumes: 7, grains: 7, nuts_seeds: 7, fish: 0 },
};

export const MAX_TARGET_PER_WEEK = 14;

/** Stored in `user_preferences.prefs.foodTargets`: the chosen diet plus any
 * group the user changed from that diet's default. */
export interface FoodTargetsPref {
  diet?: Diet;
  perWeek?: Partial<Record<TargetPillar, number>>;
}

/** Each group's weekly target, or null when it's switched off. */
export type ResolvedFoodTargets = Record<TargetPillar, number | null>;

export function targetLabel(pillar: TargetPillar): string {
  return PILLAR_LABEL[pillar];
}

function isDiet(value: unknown): value is Diet {
  return typeof value === "string" && (DIETS as string[]).includes(value);
}

export function dietOf(pref: FoodTargetsPref | undefined): Diet {
  return isDiet(pref?.diet) ? pref.diet : "everything";
}

export function resolveFoodTargets(pref: FoodTargetsPref | undefined): ResolvedFoodTargets {
  const defaults = DIET_DEFAULTS[dietOf(pref)];
  const out = {} as ResolvedFoodTargets;
  for (const pillar of TARGET_PILLARS) {
    const saved = pref?.perWeek?.[pillar];
    const value = typeof saved === "number" && Number.isFinite(saved) ? Math.min(MAX_TARGET_PER_WEEK, Math.max(0, Math.round(saved))) : defaults[pillar];
    out[pillar] = value > 0 ? value : null;
  }
  return out;
}

export const DEFAULT_FOOD_TARGETS: ResolvedFoodTargets = resolveFoodTargets(undefined);
