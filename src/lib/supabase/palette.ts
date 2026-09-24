import { supabase } from "./client";
import { upsertDirect } from "./directWrite";

const TABLE = "color_palette";
const HEX = /^#[0-9a-f]{6}$/;

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

/** The person's saved colours, oldest first — one row per user. */
export async function fetchPalette(): Promise<string[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(TABLE).select("colors").eq("user_id", myUserId).maybeSingle();
  if (error) throw error;
  const colors: unknown = data?.colors;
  return Array.isArray(colors) ? colors.filter((c): c is string => typeof c === "string" && HEX.test(c)) : [];
}

/** Replaces the whole palette. Offline / mid-outage it queues; see
 * directWrite.ts. */
export async function savePalette(colors: string[]): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, TABLE, myUserId, {
    user_id: myUserId,
    colors,
    updated_at: new Date().toISOString(),
  });
}
