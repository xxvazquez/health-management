import { supabase } from "./client";
import { upsertDirect } from "./directWrite";

/** A note against one meal occurrence — `date` + `mealTag` (Breakfast/
 * Lunch/Dinner/Snack) is the natural key; there's no separate id. Holding
 * just a note today, but its own row (rather than piggybacking on one
 * `food_logs` entry) means it survives ingredients being added or removed
 * freely, and gives a real join key for meal-level Trends work later. */
export interface MealNote {
  date: string;
  mealTag: string;
  note: string;
}

const TABLE = "meals";

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchMeals(): Promise<MealNote[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(TABLE).select("date, meal_tag, note").eq("user_id", myUserId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.date as string, mealTag: r.meal_tag as string, note: (r.note as string | null) ?? "" }));
}

/** Sets (or clears) a meal's note — one row per (user, date, meal tag), so
 * this upserts on that natural key. Offline / mid-outage it queues; see
 * directWrite.ts. */
export async function setMealNote(date: string, mealTag: string, note: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const trimmed = note.trim();
  await upsertDirect(myUserId, TABLE, `${date}_${mealTag}`, {
    user_id: myUserId,
    date,
    meal_tag: mealTag,
    note: trimmed || null,
    updated_at: new Date().toISOString(),
  });
}
