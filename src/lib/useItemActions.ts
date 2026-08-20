"use client";

import { useState } from "react";
import { getItem, putItem } from "@/lib/db/indexedDb";
import { pushItem } from "@/lib/supabase/sync";
import { titleCaseFallback } from "@/taxonomy/normalizeName";

/** The minimal shape rename/archive need — deliberately narrower than
 * `ItemStats` (which has this plus a pile of computed adherence stats) so
 * a page that only has the raw item list, not full event-derived stats
 * (e.g. a brand-new item with zero logs yet), can still use these actions.
 * `ItemStats` objects satisfy this structurally, so existing callers pass
 * one through unchanged. */
export interface ManageableItem {
  itemIdentity: string;
  item: string;
  category: string;
  isArchived: boolean;
}

/**
 * Rename + archive/unarchive + change-category for a tracked item — the
 * dynamic, Supabase-backed way to manage an item, for any item type (food,
 * supplement, outcome, habit). Shared by the Manage page and the Habits
 * page rather than duplicated, so there's exactly one place this logic
 * lives.
 *
 * Every action here is a plain column update on the item's own row — name,
 * category, or archive state — never a separate classification record.
 * Archiving only ever touches the item's own record (never its logs), so
 * history stays intact.
 */
export function useItemActions(refresh: () => Promise<void>) {
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);

  async function toggleArchive(item: ManageableItem) {
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) {
      const updated = { ...existing, isArchived: !existing.isArchived };
      await putItem(updated);
      void pushItem(updated);
    }
    await refresh();
    setBusyIdentity(null);
  }

  async function rename(item: ManageableItem, newName: string) {
    const trimmed = titleCaseFallback(newName);
    if (!trimmed || trimmed === item.item) return;
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) {
      const updated = { ...existing, rawName: trimmed };
      await putItem(updated);
      void pushItem(updated);
    }
    await refresh();
    setBusyIdentity(null);
  }

  /** Moves an item into a different category without touching its display
   * name. `newCategoryId` is the target `categories` row's id, resolved by
   * the caller (via `ensureCategoryId`) before this runs. */
  async function changeCategory(item: ManageableItem, newCategoryName: string, newCategoryId: string | null) {
    if (!newCategoryName || newCategoryName === item.category) return;
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) {
      const updated = { ...existing, category: newCategoryName, categoryId: newCategoryId };
      await putItem(updated);
      void pushItem(updated);
    }
    await refresh();
    setBusyIdentity(null);
  }

  return { busyIdentity, toggleArchive, rename, changeCategory };
}
