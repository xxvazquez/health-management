import { supabase, supabaseAnonKey, supabaseUrl } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, updateDirect, upsertDirect } from "./directWrite";

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
  /** Icon key from the fixed set in ui/customIcons; null → heart. */
  icon: string | null;
  /** Brand-hue key from CUSTOM_COLOR_CHOICES; null → position accent. */
  color: string | null;
  createdAt: string;
  /** Newest first. */
  items: WishlistItem[];
}

export interface WishlistCategoryAppearance {
  icon: string | null;
  color: string | null;
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
  icon: string | null;
  color: string | null;
  created_at: string;
  wishlist_items: ItemRow[] | null;
}

const ITEM_COLUMNS = "id, category_id, url, title, note, for_user_id, created_at";
const CATEGORY_COLUMNS = `id, name, icon, color, created_at, wishlist_items(${ITEM_COLUMNS})`;

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
    icon: row.icon,
    color: row.color,
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

const CATEGORIES_TABLE = "wishlist_categories";
const ITEMS_TABLE = "wishlist_items";

function categoryPayload(c: WishlistCategory, ownerId: string): Record<string, unknown> {
  return { id: c.id, owner_id: ownerId, name: c.name.trim(), icon: c.icon, color: c.color, created_at: c.createdAt };
}

function itemPayload(i: WishlistItem, ownerId: string): Record<string, unknown> {
  return {
    id: i.id,
    owner_id: ownerId,
    category_id: i.categoryId,
    url: i.url.trim(),
    title: i.title.trim(),
    note: i.note,
    for_user_id: i.forUserId,
    created_at: i.createdAt,
  };
}

export async function createWishlistCategory(
  name: string,
  appearance?: WishlistCategoryAppearance,
): Promise<WishlistCategory> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const c: WishlistCategory = {
    id: createTimeOrderedId(),
    name: name.trim(),
    icon: appearance?.icon ?? null,
    color: appearance?.color ?? null,
    createdAt: new Date().toISOString(),
    items: [],
  };
  await upsertDirect(myUserId, CATEGORIES_TABLE, c.id, categoryPayload(c, myUserId));
  return c;
}

export interface WishlistCategoryPatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

/** Takes the full current category (a pair-visible row that may be the
 * partner's) so the edit goes out as a plain update, not an upsert — see
 * directWrite.updateDirect. */
export async function updateWishlistCategory(category: WishlistCategory, patch: WishlistCategoryPatch): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: WishlistCategory = {
    ...category,
    name: patch.name !== undefined ? patch.name.trim() : category.name,
    icon: patch.icon !== undefined ? patch.icon : category.icon,
    color: patch.color !== undefined ? patch.color : category.color,
  };
  await updateDirect(myUserId, CATEGORIES_TABLE, next.id, categoryPayload(next, myUserId));
}

export async function deleteWishlistCategory(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, CATEGORIES_TABLE, id);
}

export interface NewWishlistItemInput {
  categoryId: string;
  url: string;
  title: string;
  note: string;
  forUserId: string | null;
}

export async function createWishlistItem(input: NewWishlistItemInput): Promise<WishlistItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const item: WishlistItem = {
    id: createTimeOrderedId(),
    categoryId: input.categoryId,
    url: input.url.trim(),
    title: input.title.trim(),
    note: input.note.trim() || null,
    forUserId: input.forUserId,
    createdAt: new Date().toISOString(),
  };
  await upsertDirect(myUserId, ITEMS_TABLE, item.id, itemPayload(item, myUserId));
  return item;
}

export interface WishlistItemPatch {
  categoryId?: string;
  url?: string;
  title?: string;
  note?: string;
  forUserId?: string | null;
}

/** Takes the full current item (see `updateWishlistCategory`). */
export async function updateWishlistItem(item: WishlistItem, patch: WishlistItemPatch): Promise<WishlistItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: WishlistItem = {
    ...item,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : item.categoryId,
    url: patch.url !== undefined ? patch.url.trim() : item.url,
    title: patch.title !== undefined ? patch.title.trim() : item.title,
    note: patch.note !== undefined ? patch.note.trim() || null : item.note,
    forUserId: patch.forUserId !== undefined ? patch.forUserId : item.forUserId,
  };
  await updateDirect(myUserId, ITEMS_TABLE, next.id, itemPayload(next, myUserId));
  return next;
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, ITEMS_TABLE, id);
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

/** A phone Share Sheet shortcut (iOS) posts links to the wishlist-share
 * Edge Function with one of these tokens standing in for a session. One
 * per account; regenerating replaces the old one. */
export interface WishlistShareToken {
  token: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const SHARE_TOKEN_COLUMNS = "token, created_at, last_used_at";

function toShareToken(row: { token: string; created_at: string; last_used_at: string | null }): WishlistShareToken {
  return { token: row.token, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

function randomShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function fetchMyShareToken(): Promise<WishlistShareToken | null> {
  if (!supabase) return null;
  const myUserId = await currentUserId();
  if (!myUserId) return null;
  const { data, error } = await supabase
    .from("wishlist_share_tokens")
    .select(SHARE_TOKEN_COLUMNS)
    .eq("owner_id", myUserId)
    .maybeSingle();
  if (error) throw error;
  return data ? toShareToken(data) : null;
}

/** Creates a token, replacing any existing one for this account. */
export async function regenerateMyShareToken(): Promise<WishlistShareToken> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await supabase.from("wishlist_share_tokens").delete().eq("owner_id", myUserId);
  const { data, error } = await supabase
    .from("wishlist_share_tokens")
    .insert({ owner_id: myUserId, token: randomShareToken() })
    .select(SHARE_TOKEN_COLUMNS)
    .single();
  if (error) throw error;
  return toShareToken(data);
}

export async function deleteMyShareToken(): Promise<void> {
  if (!supabase) return;
  const myUserId = await currentUserId();
  if (!myUserId) return;
  const { error } = await supabase.from("wishlist_share_tokens").delete().eq("owner_id", myUserId);
  if (error) throw error;
}

/** The endpoint a Share Sheet shortcut POSTs to, or null when cloud sync
 * isn't configured for this deployment. */
export function wishlistShareEndpoint(): string | null {
  return supabaseUrl ? `${supabaseUrl}/functions/v1/wishlist-share` : null;
}

export function wishlistShareAuthHeader(): string | null {
  return supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : null;
}
