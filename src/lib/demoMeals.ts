import { todayLocalISODate } from "@/lib/aggregations/common";
import type { MealNote } from "@/lib/supabase/meals";

/** One example note, on today's Breakfast, so the signed-out demo shows
 * what a meal note looks like without inventing a whole fake history. */
export function buildDemoMeals(): MealNote[] {
  return [{ date: todayLocalISODate(), mealTag: "Breakfast", note: "Felt good — no bloating after the oats today." }];
}
