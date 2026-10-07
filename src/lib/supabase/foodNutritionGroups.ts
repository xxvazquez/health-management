import { supabase } from "./client";
import { deleteWhereDirect, upsertDirect } from "./directWrite";
import { normalizeName } from "@/taxonomy/normalizeName";
import type { NutritionGroupOverride } from "@/taxonomy/nutritionGroups";

interface OverrideRow {
  item: string;
  group_id: string;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

/** Every override for the signed-in user, keyed by normalized item name —
 * the same normalization nutritionGroupsForFood applies before matching. */
export async function fetchFoodNutritionGroupOverrides(): Promise<Record<string, NutritionGroupOverride>> {
  if (!supabase) return {};
  const myUserId = await currentUserId();
  if (!myUserId) return {};
  const { data, error } = await supabase.from("food_nutrition_groups").select("item, group_id").eq("user_id", myUserId);
  if (error) throw error;
  const map: Record<string, NutritionGroupOverride> = {};
  for (const row of data as OverrideRow[]) map[normalizeName(row.item)] = row.group_id as NutritionGroupOverride;
  return map;
}

/** Sets (or replaces) the override for one food, by its exact display
 * name — an override always replaces every keyword-derived group for that
 * item, it never merges with them. Offline it queues; see directWrite.ts. */
export async function setFoodNutritionGroupOverride(item: string, groupId: NutritionGroupOverride): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, "food_nutrition_groups", `${myUserId}:${item}`, {
    user_id: myUserId,
    item,
    group_id: groupId,
    updated_at: new Date().toISOString(),
  });
}

/** Removes the override, reverting the item to automatic keyword
 * classification. */
export async function clearFoodNutritionGroupOverride(item: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteWhereDirect(myUserId, "food_nutrition_groups", { user_id: myUserId, item });
}
