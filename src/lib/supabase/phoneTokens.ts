import { supabase, supabaseAnonKey, supabaseUrl } from "./client";

/** A personal token an iOS Shortcut sends instead of a session, to one
 * Edge Function. One per account per table; regenerating replaces it. */
export interface PhoneToken {
  token: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type TokenTable = "wishlist_share_tokens" | "health_import_tokens";

const COLUMNS = "token, created_at, last_used_at";

function toToken(row: { token: string; created_at: string; last_used_at: string | null }): PhoneToken {
  return { token: row.token, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchPhoneToken(table: TokenTable): Promise<PhoneToken | null> {
  if (!supabase) return null;
  const myUserId = await currentUserId();
  if (!myUserId) return null;
  const { data, error } = await supabase.from(table).select(COLUMNS).eq("owner_id", myUserId).maybeSingle();
  if (error) throw error;
  return data ? toToken(data) : null;
}

/** Creates a token, replacing any existing one for this account. */
export async function regeneratePhoneToken(table: TokenTable): Promise<PhoneToken> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await supabase.from(table).delete().eq("owner_id", myUserId);
  const { data, error } = await supabase.from(table).insert({ owner_id: myUserId, token: randomToken() }).select(COLUMNS).single();
  if (error) throw error;
  return toToken(data);
}

export async function deletePhoneToken(table: TokenTable): Promise<void> {
  if (!supabase) return;
  const myUserId = await currentUserId();
  if (!myUserId) return;
  const { error } = await supabase.from(table).delete().eq("owner_id", myUserId);
  if (error) throw error;
}

/** An Edge Function's URL, or null when cloud sync isn't configured. */
export function functionEndpoint(name: string): string | null {
  return supabaseUrl ? `${supabaseUrl}/functions/v1/${name}` : null;
}

/** The Authorization header a shortcut sends to pass the platform's JWT gate. */
export function functionAuthHeader(): string | null {
  return supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : null;
}
