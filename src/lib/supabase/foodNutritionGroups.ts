import { supabase } from "./client";
import { normalizeName } from "@/taxonomy/normalizeName";
import type { NutritionGroupId } from "@/taxonomy/nutritionGroups";

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
export async function fetchFoodNutritionGroupOverrides(): Promise<Record<string, NutritionGroupId>> {
  if (!supabase) return {};
  const myUserId = await currentUserId();
  if (!myUserId) return {};
  const { data, error } = await supabase.from("food_nutrition_groups").select("item, group_id").eq("user_id", myUserId);
  if (error) throw error;
  const map: Record<string, NutritionGroupId> = {};
  for (const row of data as OverrideRow[]) map[normalizeName(row.item)] = row.group_id as NutritionGroupId;
  return map;
}

/** Sets (or replaces) the override for one food, by its exact display
 * name — an override always replaces every keyword-derived group for that
 * item, it never merges with them. */
export async function setFoodNutritionGroupOverride(item: string, groupId: NutritionGroupId): Promise<void> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { error } = await supabase
    .from("food_nutrition_groups")
    .upsert({ user_id: myUserId, item, group_id: groupId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Removes the override, reverting the item to automatic keyword
 * classification. */
export async function clearFoodNutritionGroupOverride(item: string): Promise<void> {
  if (!supabase) return;
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { error } = await supabase.from("food_nutrition_groups").delete().eq("user_id", myUserId).eq("item", item);
  if (error) throw error;
}
