import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, deleteWhereDirect, insertDirect, upsertDirect } from "./directWrite";

/** A named bundle of Food ingredients (e.g. a bought smoothie) — logging it
 * logs every ingredient at once, each remembering which product it came
 * from. No quantity per ingredient, same as everywhere else in Food: a
 * logged item is always "one occurrence". */
export interface FoodProduct {
  id: string;
  name: string;
  /** Where it's from, e.g. "Maczfit" — optional. */
  brand: string | null;
  isArchived: boolean;
  /** food_items ids, in the order they were added. */
  ingredientItemIds: string[];
}

interface FoodProductRow {
  id: string;
  name: string;
  brand: string | null;
  is_archived: boolean;
  food_product_ingredients: { item_id: string; sort_order: number }[] | null;
}

const PRODUCT_COLUMNS = "id, name, brand, is_archived, food_product_ingredients(item_id, sort_order)";
const PRODUCTS_TABLE = "food_products";
const INGREDIENTS_TABLE = "food_product_ingredients";

function toProduct(row: FoodProductRow): FoodProduct {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    isArchived: row.is_archived,
    ingredientItemIds: (row.food_product_ingredients ?? []).sort((a, b) => a.sort_order - b.sort_order).map((i) => i.item_id),
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchFoodProducts(): Promise<FoodProduct[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(PRODUCTS_TABLE).select(PRODUCT_COLUMNS).eq("user_id", myUserId).order("name", { ascending: true });
  if (error) throw error;
  return (data as FoodProductRow[]).map(toProduct);
}

export interface NewFoodProductInput {
  name: string;
  brand: string | null;
  ingredientItemIds: string[];
}

function productPayload(p: FoodProduct, userId: string): Record<string, unknown> {
  return {
    id: p.id,
    user_id: userId,
    name: p.name.trim(),
    brand: p.brand?.trim() || null,
    is_archived: p.isArchived,
    updated_at: new Date().toISOString(),
  };
}

// food_product_ingredients has no surrogate id — its natural key is
// (product_id, item_id). Write-once per pairing, so insert/delete it by
// that key, same as care_entry_specialties (see careLog.ts).
async function addIngredient(userId: string, productId: string, itemId: string, sortOrder: number): Promise<void> {
  const match = { product_id: productId, item_id: itemId };
  await insertDirect(userId, INGREDIENTS_TABLE, match, { user_id: userId, ...match, sort_order: sortOrder });
}

async function removeIngredient(userId: string, productId: string, itemId: string): Promise<void> {
  await deleteWhereDirect(userId, INGREDIENTS_TABLE, { product_id: productId, item_id: itemId });
}

export async function createFoodProduct(input: NewFoodProductInput): Promise<FoodProduct> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const product: FoodProduct = {
    id: createTimeOrderedId(),
    name: input.name.trim(),
    brand: input.brand?.trim() || null,
    isArchived: false,
    ingredientItemIds: input.ingredientItemIds,
  };
  await upsertDirect(myUserId, PRODUCTS_TABLE, product.id, productPayload(product, myUserId));
  await Promise.all(input.ingredientItemIds.map((itemId, i) => addIngredient(myUserId, product.id, itemId, i)));
  return product;
}

export interface FoodProductPatch {
  name?: string;
  brand?: string | null;
  isArchived?: boolean;
  ingredientItemIds?: string[];
}

/** Takes the full current product so the edit upserts a complete row and
 * can diff its ingredient list. */
export async function updateFoodProduct(product: FoodProduct, patch: FoodProductPatch): Promise<FoodProduct> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: FoodProduct = {
    ...product,
    name: patch.name !== undefined ? patch.name.trim() : product.name,
    brand: patch.brand !== undefined ? patch.brand?.trim() || null : product.brand,
    isArchived: patch.isArchived !== undefined ? patch.isArchived : product.isArchived,
    ingredientItemIds: patch.ingredientItemIds ?? product.ingredientItemIds,
  };
  await upsertDirect(myUserId, PRODUCTS_TABLE, next.id, productPayload(next, myUserId));
  if (patch.ingredientItemIds !== undefined) {
    const nextIds = patch.ingredientItemIds;
    const prevIds = product.ingredientItemIds;
    for (const itemId of prevIds.filter((id) => !nextIds.includes(id))) await removeIngredient(myUserId, product.id, itemId);
    for (const [i, itemId] of nextIds.entries()) if (!prevIds.includes(itemId)) await addIngredient(myUserId, product.id, itemId, i);
  }
  return next;
}

export async function deleteFoodProduct(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  // food_product_ingredients rows cascade on the product delete; any past
  // food_logs.product_id pointing at it is set null, not blocked.
  await deleteDirect(myUserId, PRODUCTS_TABLE, id);
}
