"use client";

import { useState } from "react";
import type { ItemType } from "@/taxonomy/categories";
import type { OverrideEntry } from "@/taxonomy/classify";
import { getItem, putItem, setUserOverride } from "@/lib/db/indexedDb";
import { pushItem, pushUserOverride } from "@/lib/supabase/sync";
import { normalizeName } from "@/taxonomy/normalizeName";

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
  subcategory: string;
  isArchived: boolean;
}

/**
 * Rename + archive/unarchive for a tracked item — the one dynamic,
 * Supabase-backed way to manage an item's display name and Log-page
 * visibility, for any item type (food, supplement, outcome, habit).
 * Shared by the Manage page and the Habits page rather than duplicated,
 * so there's exactly one place this logic lives.
 *
 * Archiving only ever touches the item's own record (never its logs), so
 * history stays intact; renaming keeps the same identity and copies the
 * item's existing classification onto the new name via a user override, so
 * a rename can't accidentally reclassify it.
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

  async function rename(item: ManageableItem, itemType: ItemType, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === item.item) return;
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) {
      const updated = { ...existing, rawName: trimmed };
      await putItem(updated);
      void pushItem(updated);
    }
    const key = normalizeName(trimmed);
    const override: OverrideEntry = {
      canonicalName: trimmed,
      itemType,
      category: item.category,
      subcategory: item.subcategory,
    };
    await setUserOverride(key, override);
    void pushUserOverride(key, override);
    await refresh();
    setBusyIdentity(null);
  }

  /** Moves an item into a different category without touching its display
   * name. Keyed off the item's actual current `rawName` (fetched fresh,
   * not `item.item` — the canonical *display* name can already differ from
   * the raw name it was logged under if it went through a prior override,
   * and the override key has to match what `classifyItem` will actually
   * look up for this item, or the change silently does nothing). */
  async function changeCategory(item: ManageableItem, itemType: ItemType, newCategory: string) {
    if (!newCategory || newCategory === item.category) return;
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    const rawName = existing?.rawName ?? item.item;
    const key = normalizeName(rawName);
    const override: OverrideEntry = {
      canonicalName: item.item,
      itemType,
      category: newCategory,
      subcategory: newCategory,
    };
    await setUserOverride(key, override);
    void pushUserOverride(key, override);
    await refresh();
    setBusyIdentity(null);
  }

  return { busyIdentity, toggleArchive, rename, changeCategory };
}
