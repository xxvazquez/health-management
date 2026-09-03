import { supabase, supabaseAnonKey, supabaseUrl } from "./client";

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
  /** Icon key from the fixed set in wishlistIcons; null → heart. */
  icon: string | null;
  /** Brand-hue key from WISHLIST_COLOR_CHOICES; null → position accent. */
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

export async function createWishlistCategory(
  name: string,
  appearance?: WishlistCategoryAppearance,
): Promise<WishlistCategory> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("wishlist_categories")
    .insert({
      owner_id: myUserId,
      name: name.trim(),
      icon: appearance?.icon ?? null,
      color: appearance?.color ?? null,
    })
    .select(CATEGORY_COLUMNS)
    .single();
  if (error) throw error;
  return toCategory(data as CategoryRow);
}

export interface WishlistCategoryPatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

export async function updateWishlistCategory(id: string, patch: WishlistCategoryPatch): Promise<void> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.color !== undefined) update.color = patch.color;
  const { error } = await supabase.from("wishlist_categories").update(update).eq("id", id);
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
