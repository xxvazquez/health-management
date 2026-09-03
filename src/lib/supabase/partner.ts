import { supabase } from "./client";

export interface PartnerLink {
  id: string;
  /** The OTHER user's id — resolved relative to whoever's asking, so
   * callers never need to know which of the row's two columns is "them". */
  partnerId: string;
  createdAt: string;
}

interface PartnerLinkRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function toPartnerLink(row: PartnerLinkRow, myUserId: string): PartnerLink {
  return {
    id: row.id,
    partnerId: row.user_a_id === myUserId ? row.user_b_id : row.user_a_id,
    createdAt: row.created_at,
  };
}

/** The signed-in user's current partner link, or null if they haven't
 * linked anyone yet — RLS already scopes this to rows they're a
 * participant of, so there's at most one row to find. */
export async function getPartnerLink(): Promise<PartnerLink | null> {
  if (!supabase) return null;
  const myUserId = await currentUserId();
  if (!myUserId) return null;
  const { data, error } = await supabase.from("partner_links").select("id, user_a_id, user_b_id, created_at").maybeSingle();
  if (error) throw error;
  return data ? toPartnerLink(data as PartnerLinkRow, myUserId) : null;
}

export interface PartnerInvite {
  code: string;
  expiresAt: string;
}

// Unambiguous alphabet (no 0/O/1/I) — a partner has to type this in by
// hand from wherever it was shared (text, WhatsApp, in person), so a code
// that's easy to misread defeats the point.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

/** Creates a fresh 7-day invite code for the signed-in user to share with
 * their partner. Retries once on the astronomically rare chance of a
 * collision with someone else's still-active code — the table's unique
 * constraint is the actual guarantee against a real collision reaching
 * either user; the retry just keeps that one-in-a-billion case from
 * surfacing as a raw error instead of quietly trying again. */
export async function createPartnerInvite(): Promise<PartnerInvite> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");

  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from("partner_invites")
      .insert({ code, created_by: myUserId })
      .select("code, expires_at")
      .single();
    if (!error && data) return { code: data.code, expiresAt: data.expires_at };
    if (error && error.code !== "23505") throw error; // 23505 = unique_violation on `code`
  }
  throw new Error("Couldn't generate a unique invite code — try again.");
}

/** Redeems someone else's invite code, creating the partner link. Every
 * business rule (already redeemed, expired, your own code, either side
 * already linked) lives server-side in redeem_partner_invite — see
 * supabase/schema.sql — so a rejection here is that function's own error
 * message, already meant to be shown to the user as-is. */
export async function redeemPartnerInvite(code: string): Promise<void> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { error } = await supabase.rpc("redeem_partner_invite", { invite_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message);
}
