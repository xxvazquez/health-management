import overridesJson from "./overrides.json";
import foodKeywordsJson from "./foodKeywords.json";
import { normalizeName, titleCaseFallback } from "./normalizeName";
import type { ItemType } from "./categories";

export interface Classification {
  canonicalName: string;
  itemType: ItemType;
  category: string;
  subcategory: string;
  /** How we arrived at this classification — surfaced in the UI so guesses are never silent. */
  matchedBy: "override" | "food-keyword" | "fallback";
}

type OverrideEntry = {
  canonicalName: string;
  itemType: ItemType;
  category: string;
  subcategory: string;
};

const overrides = overridesJson as unknown as Record<string, OverrideEntry>;
const foodKeywords = foodKeywordsJson as unknown as Record<string, string>;

/** Longest-keyword-first so multi-word keys like "oat milk" win over "milk". */
const foodKeywordEntries = Object.entries(foodKeywords)
  .filter(([key]) => key !== "_comment")
  .sort((a, b) => b[0].length - a[0].length);

function lookupFoodCategory(remainder: string): string | null {
  const norm = normalizeName(remainder);
  for (const [keyword, category] of foodKeywordEntries) {
    if (norm === keyword || norm.includes(keyword)) return category;
  }
  return null;
}

/**
 * Classify a raw habit name into the analytical taxonomy.
 * 1. Exact override match (the seeded, human-curated taxonomy).
 * 2. Pattern fallback for "Eat X" / "Drink X" against the food keyword dictionary
 *    — keeps newly-added foods usable without editing code. Every category this
 *    can return already exists in categories.ts because a real tracked item
 *    uses it — nothing here invents a new category.
 * 3. Generic fallback: an unrecognized "Eat X"/"Drink X" still gets item_type
 *    food (the name says so) filed under the real food/Misc category rather
 *    than a fabricated one; anything else falls to habit/Other. Either way
 *    it's explicitly marked so it's visible as unclassified, never silent.
 */
export function classifyHabit(rawName: string): Classification {
  const key = normalizeName(rawName);

  const override = overrides[key];
  if (override) {
    return { ...override, matchedBy: "override" };
  }

  const eatMatch = /^eat\s+(.+)$/.exec(key);
  const drinkMatch = /^drink\s+(.+)$/.exec(key);
  const remainder = eatMatch?.[1] ?? drinkMatch?.[1];
  if (remainder) {
    const category = lookupFoodCategory(remainder) ?? "Misc";
    return {
      // Drop the "Eat"/"Drink" verb for display — "Eat X" is how the
      // source app phrases a habit, but the canonical item is just "X".
      canonicalName: titleCaseFallback(remainder),
      itemType: "food",
      category,
      subcategory: category,
      matchedBy: category === "Misc" ? "fallback" : "food-keyword",
    };
  }

  return {
    canonicalName: titleCaseFallback(rawName),
    itemType: "habit",
    category: "Other",
    subcategory: "Other",
    matchedBy: "fallback",
  };
}
