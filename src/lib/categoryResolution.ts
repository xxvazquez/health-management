import { putCategory } from "@/lib/db/indexedDb";
import { pushCategory } from "@/lib/supabase/sync";
import { CATEGORIES_BY_TYPE, type ItemType } from "@/taxonomy/categories";
import type { RawCategory } from "@/lib/types";

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
    await putCategory(entry);
    void pushCategory(entry);
  }
  return resultId;
}

/** Same seeding logic as `ensureCategoryId`, but as plain rows for demo
 * mode's in-memory state instead of writing to IndexedDB/Supabase. */
export function categoryRowsToSeedForDemo(itemType: ItemType, name: string, existing: RawCategory[]): RawCategory[] {
  return categoryNamesToSeed(itemType, name, existing).map((seedName) => ({ id: crypto.randomUUID(), itemType, name: seedName }));
}
