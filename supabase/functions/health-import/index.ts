// Takes a day's walking minutes from an iOS Shortcut reading Apple Health
// and saves them as that day's Walking entry in Log → Workout. The
// shortcut has no Supabase session, so it authenticates with a per-user
// token (health_import_tokens) in the query string or body; the
// Authorization header carries the anon key to pass the platform's JWT gate.
//
// One entry per day: the row id is derived from (user, exercise, date), so
// running the shortcut again the same day replaces the value instead of
// adding a second entry. Apple Health is that day's record: a walk typed in
// by hand for the same exercise and day is removed so it isn't counted twice.
// A day with 0 minutes removes the imported entry and leaves typed ones.
//
// Deployed by .github/workflows/deploy-functions.yml. SUPABASE_URL and the
// project's secret key are injected automatically; no other secrets.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretKey } from "../_shared/keys.ts";

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

const DEFAULT_EXERCISE = "Walking";
const DEFAULT_TIMEZONE = "Europe/Warsaw";
const MAX_MINUTES = 24 * 60;

const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!);

/** First number in whatever Shortcuts sends ("34", "34.5", "34 min", 34). */
function parseMinutes(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const m = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "2026-10-02", or today in `timeZone` when the shortcut sends none. */
function parseDate(raw: unknown, timeZone: string): string | null {
  if (typeof raw === "string" && raw.trim()) {
    const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
  }
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** A stable UUID (version-5 layout) from a name, so the same day always maps to the same row. */
async function stableId(name: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(name))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await handle(req);
  } catch (err) {
    console.error("health-import: unhandled", err);
    return json({ error: "Server error" }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const query = new URL(req.url).searchParams;
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await req.text());
    // Shortcuts capitalises the first letter of a JSON field name.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) body[k.toLowerCase()] = v;
    }
  } catch {
    body = {};
  }
  const field = (name: string) => query.get(name) ?? body[name];

  const token = String(field("token") ?? "").trim();
  if (!token) return json({ error: "token is required" }, 400);

  const minutes = parseMinutes(field("minutes"));
  if (minutes === null || minutes < 0 || minutes > MAX_MINUTES) return json({ error: "minutes must be a number from 0 to 1440" }, 400);

  const timeZone = String(field("timezone") ?? DEFAULT_TIMEZONE);
  const date = parseDate(field("date"), timeZone);
  if (!date) return json({ error: "date must look like 2026-10-02" }, 400);

  const { data: tok, error: tokErr } = await admin.from("health_import_tokens").select("owner_id").eq("token", token).maybeSingle();
  if (tokErr) {
    console.error("health-import: token lookup failed", tokErr.message);
    return json({ error: "Server error" }, 500);
  }
  if (!tok) return json({ error: "Unknown token" }, 401);
  const ownerId = tok.owner_id as string;

  const exercise = String(field("exercise") ?? DEFAULT_EXERCISE).trim() || DEFAULT_EXERCISE;
  const { data: item, error: itemErr } = await admin
    .from("workout_items")
    .select("id")
    .eq("user_id", ownerId)
    .eq("name_key", exercise.toLowerCase())
    .eq("is_archived", false)
    .maybeSingle();
  if (itemErr) {
    console.error("health-import: exercise lookup failed", itemErr.message);
    return json({ error: "Server error" }, 500);
  }
  if (!item) return json({ error: `No active exercise called "${exercise}" in Settings → Workout` }, 404);

  const id = await stableId(`apple-health:${ownerId}:${item.id}:${date}`);
  const rounded = Math.round(minutes);

  if (rounded === 0) {
    const { error } = await admin.from("workout_logs").delete().eq("user_id", ownerId).eq("id", id);
    if (error) {
      console.error("health-import: delete failed", error.message);
      return json({ error: "Server error" }, 500);
    }
  } else {
    const { error } = await admin
      .from("workout_logs")
      .upsert({ id, user_id: ownerId, item_id: item.id, date, weight_kg: rounded, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
    if (error) {
      console.error("health-import: upsert failed", error.message);
      return json({ error: "Server error" }, 500);
    }
    const { error: dupErr } = await admin
      .from("workout_logs")
      .delete()
      .eq("user_id", ownerId)
      .eq("item_id", item.id)
      .eq("date", date)
      .neq("id", id);
    if (dupErr) console.error("health-import: removing typed entries failed", dupErr.message);
  }

  await admin.from("health_import_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", token);
  return json({ ok: true, date, exercise, minutes: rounded });
}
