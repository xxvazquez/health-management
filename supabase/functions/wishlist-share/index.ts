// Saves a link to the Household Wishlist from a phone Share Sheet shortcut
// (iOS). The shortcut has no Supabase session, so it authenticates with a
// per-user capture token (wishlist_share_tokens) in the request body; the
// Authorization header still carries the anon key to pass the platform's
// JWT gate. Android adds links through the PWA share target and never hits
// this.
//
// Deployed by .github/workflows/deploy-functions.yml. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically for every Edge
// Function; this needs no other secrets.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The list new links land in — one per account, created on first use. The
// user re-files items into their own lists in the app.
const DEFAULT_LIST = "Saved from phone";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function cleanUrl(raw: unknown): string | null {
  // A phone share can hand over almost any shape: a bare string, a list
  // from "Get URLs from Input", or (Chrome on iOS) a dictionary like
  // {"public.url": "https://…", …}. Flatten to text and pull the first
  // http(s) token out of it.
  let candidate = "";
  if (typeof raw === "string") candidate = raw;
  else if (Array.isArray(raw)) candidate = raw.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
  else if (raw != null) candidate = typeof raw === "object" ? JSON.stringify(raw) : String(raw);

  const match = candidate.match(/https?:\/\/[^\s"'}\],]+/i);
  candidate = (match ? match[0] : candidate).trim();
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

async function titleFor(url: string, provided: unknown): Promise<string> {
  const given = typeof provided === "string" ? provided.trim() : "";
  if (given) return given.slice(0, 300);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-link-metadata`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.title === "string" && data.title.trim()) return data.title.trim().slice(0, 300);
    }
  } catch {
    // fall through to the hostname
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 300);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Shortcuts capitalises the first letter of a JSON field name by
  // default, so accept `Token` / `URL` / `For` too.
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) body[k.toLowerCase()] = v;

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return json({ error: "token is required" }, 400);

  const url = cleanUrl(body.url);
  if (!url) return json({ error: "A valid http(s) url is required" }, 400);

  const forWhom = body.for === "me" || body.for === "partner" ? body.for : "either";

  const { data: tok, error: tokErr } = await admin
    .from("wishlist_share_tokens")
    .select("owner_id")
    .eq("token", token)
    .maybeSingle();
  if (tokErr) {
    console.error("wishlist-share: token lookup failed", tokErr.message);
    return json({ error: "Server error" }, 500);
  }
  if (!tok) return json({ error: "Unknown token" }, 401);
  const ownerId = tok.owner_id as string;

  let forUserId: string | null = null;
  if (forWhom === "me") {
    forUserId = ownerId;
  } else if (forWhom === "partner") {
    const { data: link } = await admin
      .from("partner_links")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${ownerId},user_b_id.eq.${ownerId}`)
      .maybeSingle();
    if (link) forUserId = link.user_a_id === ownerId ? link.user_b_id : link.user_a_id;
  }

  let listId: string;
  const { data: existing } = await admin
    .from("wishlist_categories")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("name", DEFAULT_LIST)
    .maybeSingle();
  if (existing) {
    listId = existing.id as string;
  } else {
    const { data: created, error: listErr } = await admin
      .from("wishlist_categories")
      .insert({ owner_id: ownerId, name: DEFAULT_LIST })
      .select("id")
      .single();
    if (listErr || !created) {
      console.error("wishlist-share: list create failed", listErr?.message);
      return json({ error: "Could not create the list" }, 500);
    }
    listId = created.id as string;
  }

  const title = await titleFor(url, body.title);

  const { error: itemErr } = await admin.from("wishlist_items").insert({
    owner_id: ownerId,
    category_id: listId,
    url,
    title,
    note: null,
    for_user_id: forUserId,
  });
  if (itemErr) {
    console.error("wishlist-share: item insert failed", itemErr.message);
    return json({ error: "Could not save the link" }, 500);
  }

  await admin.from("wishlist_share_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", token);

  return json({ ok: true, title, list: DEFAULT_LIST });
});
