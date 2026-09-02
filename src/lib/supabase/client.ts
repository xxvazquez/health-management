import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until the two public env vars are set — everything cloud-related
 * becomes a no-op rather than erroring, so the app works fully offline
 * before (or without) a Supabase project being set up. */
export const supabaseConfigured = Boolean(url && anonKey);

/** The project URL and anon key, exposed for the Wishlist "add from your
 * phone" panel, which shows the wishlist-share Edge Function endpoint and
 * the header a Share Sheet shortcut needs. Both are already public (the
 * anon key ships in the client bundle). */
export const supabaseUrl = url ?? null;
export const supabaseAnonKey = anonKey ?? null;

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
