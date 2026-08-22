import { putCategoryAndSync, putItemAndSync } from "@/lib/supabase/sync";
import { CATEGORIES_BY_TYPE, type ItemType } from "@/taxonomy/categories";
import { WORKOUT_EXERCISES, type RawCategory, type RawItem } from "@/lib/types";
import { todayLocalISODate } from "@/lib/aggregations/common";

/**
 * Which names need a real `categories` row before `name` is usable for
 * `itemType`. If this type has never had a single row before, the *whole*
 * built-in default list gets materialized at once (matching the
 * pre-redesign behavior: "the first customization for a type copies the
 * current defaults in, and they become the source of truth from then on")
 * — not just the one name being requested — so the picker doesn't collapse
 * down to a single option the moment someone logs their first item of that
 * type. Once any row exists, only ever-actually-missing names get added.
 */
function categoryNamesToSeed(itemType: ItemType, name: string, existing: RawCategory[]): string[] {
  const hasAnyRow = existing.some((c) => c.itemType === itemType);
  if (!hasAnyRow) return Array.from(new Set([...CATEGORIES_BY_TYPE[itemType], name]));
  const hasThisName = existing.some((c) => c.itemType === itemType && c.name === name);
  return hasThisName ? [] : [name];
}

/**
 * Resolves a category name to its `categories` row id, creating whatever
 * rows are missing (see `categoryNamesToSeed`) along the way. Every item
 * type — food included — references a category by id (a real FK, `on
 * delete restrict`), so a name alone isn't enough to write an item.
 */
export async function ensureCategoryId(itemType: ItemType, name: string, existing: RawCategory[]): Promise<string> {
  const found = existing.find((c) => c.itemType === itemType && c.name === name);
  const toSeed = categoryNamesToSeed(itemType, name, existing);
  let resultId = found?.id ?? "";
  for (const seedName of toSeed) {
    const id = crypto.randomUUID();
    if (seedName === name) resultId = id;
    const entry: RawCategory = { id, itemType, name: seedName };
    await putCategoryAndSync(entry);
  }
  return resultId;
}

/** Same seeding logic as `ensureCategoryId`, but as plain rows for demo
 * mode's in-memory state instead of writing to IndexedDB/Supabase. */
export function categoryRowsToSeedForDemo(itemType: ItemType, name: string, existing: RawCategory[]): RawCategory[] {
  return categoryNamesToSeed(itemType, name, existing).map((seedName) => ({ id: crypto.randomUUID(), itemType, name: seedName }));
}

/**
 * Materializes the 7 exercises this app used to hardcode (`WORKOUT_EXERCISES`)
 * as real `workout_items`, all filed under a seeded "Strength Training"
 * category — but only the first time, for a user with zero workout items
 * of their own yet. Mirrors `categoryNamesToSeed`'s "whole default list at
 * once, never again once anything real exists" rule, so the Workout tab
 * isn't empty for a brand-new signed-in user, while still leaving exercise
 * names fully user-editable (rename/archive/add via Manage) from then on.
 */
export async function ensureDefaultWorkoutItems(existingItems: RawItem[], existingCategories: RawCategory[]): Promise<void> {
  if (existingItems.some((i) => i.itemType === "workout")) return;
  const categoryId = await ensureCategoryId("workout", "Strength Training", existingCategories);
  const today = todayLocalISODate();
  for (const name of WORKOUT_EXERCISES) {
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: "workout",
      rawName: name,
      category: "Strength Training",
      categoryId,
      isArchived: false,
      createdDate: today,
      reminderTime: null,
      unit: "kg",
    };
    await putItemAndSync(item);
  }
}
