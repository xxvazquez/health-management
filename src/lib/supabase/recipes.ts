import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, deleteWhereDirect, insertDirect, upsertDirect } from "./directWrite";

export const RECIPE_UNITS = ["g", "ml", "pcs", "tsp", "tbsp", "cup"] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export interface RecipeIngredient {
  /** food_items id. */
  itemId: string;
  amount: number | null;
  unit: RecipeUnit | null;
}

/** A meal worth making again: its foods (with optional amounts), steps,
 * a note and a 1–5 rating. */
export interface Recipe {
  id: string;
  name: string;
  mealTag: string | null;
  rating: number | null;
  steps: string[];
  note: string | null;
  ingredients: RecipeIngredient[];
  createdAt: string;
}

interface RecipeRow {
  id: string;
  name: string;
  meal_tag: string | null;
  rating: number | null;
  steps: string[] | null;
  note: string | null;
  created_at: string;
  recipe_ingredients: { item_id: string; amount: number | null; unit: string | null; sort_order: number }[] | null;
}

const COLUMNS = "id, name, meal_tag, rating, steps, note, created_at, recipe_ingredients(item_id, amount, unit, sort_order)";
const RECIPES_TABLE = "recipes";
const INGREDIENTS_TABLE = "recipe_ingredients";

const isUnit = (u: unknown): u is RecipeUnit => typeof u === "string" && (RECIPE_UNITS as readonly string[]).includes(u);

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    mealTag: row.meal_tag,
    rating: row.rating,
    steps: row.steps ?? [],
    note: row.note,
    createdAt: row.created_at,
    ingredients: (row.recipe_ingredients ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ itemId: i.item_id, amount: i.amount == null ? null : Number(i.amount), unit: isUnit(i.unit) ? i.unit : null })),
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchRecipes(): Promise<Recipe[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(RECIPES_TABLE).select(COLUMNS).eq("user_id", myUserId);
  if (error) throw error;
  return (data as RecipeRow[]).map(toRecipe);
}

export type RecipeInput = Omit<Recipe, "id" | "createdAt">;

function recipePayload(r: Recipe, userId: string): Record<string, unknown> {
  return {
    id: r.id,
    user_id: userId,
    name: r.name.trim(),
    meal_tag: r.mealTag,
    rating: r.rating,
    steps: r.steps.map((s) => s.trim()).filter(Boolean),
    note: r.note?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

// recipe_ingredients is keyed by (recipe_id, item_id): upsert changed rows,
// delete removed ones — same shape as food_product_ingredients.
async function writeIngredient(userId: string, recipeId: string, ing: RecipeIngredient, sortOrder: number, isNew: boolean): Promise<void> {
  const match = { recipe_id: recipeId, item_id: ing.itemId };
  const row = { user_id: userId, ...match, amount: ing.amount, unit: ing.amount == null ? null : ing.unit, sort_order: sortOrder };
  if (isNew) await insertDirect(userId, INGREDIENTS_TABLE, match, row);
  else await upsertDirect(userId, INGREDIENTS_TABLE, `${recipeId}_${ing.itemId}`, row);
}

export async function createRecipe(input: RecipeInput): Promise<Recipe> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const recipe: Recipe = { ...input, id: createTimeOrderedId(), createdAt: new Date().toISOString() };
  await upsertDirect(myUserId, RECIPES_TABLE, recipe.id, recipePayload(recipe, myUserId));
  await Promise.all(recipe.ingredients.map((ing, i) => writeIngredient(myUserId, recipe.id, ing, i, true)));
  return recipe;
}

/** Saves the whole recipe, diffing its ingredients against `previous`. */
export async function updateRecipe(previous: Recipe, next: Recipe): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, RECIPES_TABLE, next.id, recipePayload(next, myUserId));
  const nextIds = new Set(next.ingredients.map((i) => i.itemId));
  const prevIds = new Set(previous.ingredients.map((i) => i.itemId));
  for (const ing of previous.ingredients) if (!nextIds.has(ing.itemId)) await deleteWhereDirect(myUserId, INGREDIENTS_TABLE, { recipe_id: next.id, item_id: ing.itemId });
  for (const [i, ing] of next.ingredients.entries()) await writeIngredient(myUserId, next.id, ing, i, !prevIds.has(ing.itemId));
}

export async function deleteRecipe(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  // Its recipe_ingredients rows cascade.
  await deleteDirect(myUserId, RECIPES_TABLE, id);
}
