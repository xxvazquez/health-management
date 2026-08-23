"use client";

import { useState } from "react";
import { getItem, renameWorkoutLogsExercise } from "@/lib/db/indexedDb";
import { putItemAndSync, setItemReminderTimeAndSync, deleteItemAndSync } from "@/lib/supabase/sync";
import { titleCaseFallback } from "@/taxonomy/normalizeName";
import type { WorkoutUnit } from "@/lib/types";

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
  /** Local "HH:MM", supplement/habit items only; null/undefined means no
   * reminder. Optional (unlike the rest of this interface) because
   * `ItemStats` (`lib/aggregations/itemStats.ts`) also structurally
   * satisfies `ManageableItem` and has no natural way to compute this —
   * it's derived from logged events, not raw item rows, and reminders
   * don't affect adherence stats. Only the Manage page's own
   * `toManageable` ever actually sets this. */
  reminderTime?: string | null;
  /** True if this item has ever been logged or has a diary note — a hard
   * delete would be rejected by Supabase for such an item (see
   * `deleteItemAndSync`'s doc comment), so callers only offer Delete when
   * this is false. Optional/defaults to "has history" (no delete offered)
   * for the same structural-compatibility reason as `reminderTime`. */
  hasHistory?: boolean;
  /** Workout items only — what a logged value means for this exercise (kg,
   * minutes, reps). Optional for the same structural-compatibility reason
   * as `reminderTime`/`hasHistory`. */
  unit?: WorkoutUnit | null;
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
      await putItemAndSync(updated);
    }
    await refresh();
    setBusyIdentity(null);
  }

  async function rename(item: ManageableItem, newName: string) {
    const trimmed = titleCaseFallback(newName);
    if (!trimmed || trimmed === item.item) return;
    setBusyIdentity(item.itemIdentity);
    try {
      const existing = await getItem(item.itemIdentity);
      if (existing) {
        const updated = { ...existing, rawName: trimmed };
        await putItemAndSync(updated);
        // Workout logs need their own cascade — see
        // renameWorkoutLogsExercise's doc comment for why.
        if (existing.itemType === "workout") await renameWorkoutLogsExercise(existing.rawName, trimmed);
      }
      await refresh();
    } finally {
      setBusyIdentity(null);
    }
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
      await putItemAndSync(updated);
    }
    await refresh();
    setBusyIdentity(null);
  }

  /** Supplement/habit only, wired from the Manage page's per-row time
   * input. Goes through setItemReminderTimeAndSync, not putItemAndSync —
   * see that function's own doc comment for why the reminder dedupe stamp
   * needs different sync handling than every other field here. */
  async function setReminderTime(item: ManageableItem, time: string | null) {
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) await setItemReminderTimeAndSync(existing, time);
    await refresh();
    setBusyIdentity(null);
  }

  /** Workout items only, wired from the Manage page's per-row unit select. */
  async function setUnit(item: ManageableItem, unit: WorkoutUnit) {
    if (unit === item.unit) return;
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) await putItemAndSync({ ...existing, unit });
    await refresh();
    setBusyIdentity(null);
  }

  /** Hard-deletes an item, as opposed to archiving it — only ever called
   * for an item the caller has already confirmed has no logged history
   * (see `ManageableItem.hasHistory`), since one with any history can't be
   * deleted (see `deleteItemAndSync`'s doc comment). `deleteItemAndSync`
   * re-checks that freshly and can throw if it's gone stale — left to
   * propagate to the caller (rather than swallowed here) so it can tell the
   * user, but `busyIdentity` is still cleared either way via `finally`. */
  async function deleteItem(item: ManageableItem) {
    setBusyIdentity(item.itemIdentity);
    try {
      const existing = await getItem(item.itemIdentity);
      if (existing) await deleteItemAndSync(existing.identity, existing.itemType);
      await refresh();
    } finally {
      setBusyIdentity(null);
    }
  }

  return { busyIdentity, toggleArchive, rename, changeCategory, setReminderTime, setUnit, deleteItem };
}
