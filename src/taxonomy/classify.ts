import foodKeywordsJson from "./foodKeywords.json";
import { normalizeName } from "./normalizeName";

const foodKeywords = foodKeywordsJson as unknown as Record<string, string>;

/** Longest-keyword-first so multi-word keys like "oat milk" win over "milk". */
const foodKeywordEntries = Object.entries(foodKeywords)
  .filter(([key]) => key !== "_comment")
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Guesses a food's category from its typed name — used only to prefill the
 * category field when adding a brand-new food from the Log or Manage page.
 * `availableCategories` gates the result to the caller's *current* live
 * food category list: a keyword match against a category the user has
 * since removed must not silently recreate it (the same guarantee already
 * covers the category picker itself — this closes the one path that could
 * bypass it). Category is a real, explicit column on every item now (set
 * once at creation, editable from Manage), so this is a one-time UX
 * convenience, not something read at display time.
 */
export function lookupFoodCategory(name: string, availableCategories: readonly string[]): string | null {
  const norm = normalizeName(name);
  for (const [keyword, category] of foodKeywordEntries) {
    if ((norm === keyword || norm.includes(keyword)) && availableCategories.includes(category)) return category;
  }
  return null;
}
