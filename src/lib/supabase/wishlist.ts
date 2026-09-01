import { supabase, supabaseConfigured } from "./client";

/** Same "is cloud set up" flag as the rest of Household — a wishlist is
 * shared between two real signed-in accounts, no offline/local-only mode. */
export const wishlistConfigured = supabaseConfigured;

export interface WishlistItem {
  id: string;
  categoryId: string;
  url: string;
  title: string;
  note: string | null;
  /** One of the two household member ids, or null for "either of you". */
  forUserId: string | null;
  createdAt: string;
}

export interface WishlistCategory {
  id: string;
  name: string;
  createdAt: string;
  /** Newest first. */
  items: WishlistItem[];
}

interface ItemRow {
  id: string;
  category_id: string;
  url: string;
  title: string;
  note: string | null;
  for_user_id: string | null;
  created_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
  created_at: string;
  wishlist_items: ItemRow[] | null;
}

const ITEM_COLUMNS = "id, category_id, url, title, note, for_user_id, created_at";
const CATEGORY_COLUMNS = `id, name, created_at, wishlist_items(${ITEM_COLUMNS})`;

function toItem(row: ItemRow): WishlistItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    url: row.url,
    title: row.title,
    note: row.note,
    forUserId: row.for_user_id,
    createdAt: row.created_at,
  };
}

function toCategory(row: CategoryRow): WishlistCategory {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    items: (row.wishlist_items ?? []).map(toItem).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function notConfigured(): Error {
  return new Error("Cloud sync isn't set up for this deployment.");
}

/** Categories oldest first (stable order — the per-category accent colour
 * is keyed off this position), each with its items newest first. RLS
 * scopes both tables to the household pair, so no owner filter is needed. */
export async function fetchWishlist(): Promise<WishlistCategory[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("wishlist_categories")
    .select(CATEGORY_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as CategoryRow[]).map(toCategory);
}

export async function createWishlistCategory(name: string): Promise<WishlistCategory> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("wishlist_categories")
    .insert({ owner_id: myUserId, name: name.trim() })
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) throw error;
  return toCategory(data as CategoryRow);
}

export async function renameWishlistCategory(id: string, name: string): Promise<void> {
  if (!supabase) throw notConfigured();
  const { error } = await supabase
    .from("wishlist_categories")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWishlistCategory(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("wishlist_categories").delete().eq("id", id);
  if (error) throw error;
}

export interface NewWishlistItemInput {
  categoryId: string;
  url: string;
  title: string;
  note: string;
  forUserId: string | null;
}

export async function createWishlistItem(input: NewWishlistItemInput): Promise<WishlistItem> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      owner_id: myUserId,
      category_id: input.categoryId,
      url: input.url.trim(),
      title: input.title.trim(),
      note: input.note.trim() || null,
      for_user_id: input.forUserId,
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data as ItemRow);
}

export interface WishlistItemPatch {
  categoryId?: string;
  url?: string;
  title?: string;
  note?: string;
  forUserId?: string | null;
}

export async function updateWishlistItem(id: string, patch: WishlistItemPatch): Promise<WishlistItem> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.url !== undefined) update.url = patch.url.trim();
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.note !== undefined) update.note = patch.note.trim() || null;
  if (patch.forUserId !== undefined) update.for_user_id = patch.forUserId;
  const { data, error } = await supabase
    .from("wishlist_items")
    .update(update)
    .eq("id", id)
    .select(ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data as ItemRow);
}

export async function deleteWishlistItem(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("wishlist_items").delete().eq("id", id);
  if (error) throw error;
}

/** Asks the fetch-link-metadata Edge Function for a page's title — the
 * client can't fetch arbitrary sites itself (CORS). Returns null for the
 * title on any failure (function not deployed, site unreachable, no
 * title), so the form falls back to a hand-typed title rather than
 * blocking. */
export async function fetchLinkMetadata(url: string): Promise<{ title: string | null }> {
  if (!supabase) return { title: null };
  try {
    const { data, error } = await supabase.functions.invoke("fetch-link-metadata", { body: { url } });
    if (error) throw error;
    const title = typeof (data as { title?: unknown })?.title === "string" ? (data as { title: string }).title.trim() : "";
    return { title: title || null };
  } catch (err) {
    console.error("fetchLinkMetadata failed", err);
    return { title: null };
  }
}
