// Takes one card payment from an iOS Shortcut (a Wallet "Transaction"
// automation on the Revolut card) and saves it in Notes → Expenses. The
// shortcut has no Supabase session, so it authenticates with a per-user
// token (expense_import_tokens) in the query string or body; the
// Authorization header carries the anon key to pass the platform's JWT gate.
//
// Fields: merchant and amount (required; amount as Wallet formats it,
// "45,00 zł" or "€12.50"), currency (optional, when the amount has no
// symbol), card (optional, the card's name). The payment gets the category
// the same merchant had last time, or none so it waits under "To
// categorise". The same merchant, amount and currency again within two
// minutes is taken as the automation firing twice and not saved again.
//
// Deployed by .github/workflows/deploy-functions.yml. SUPABASE_URL and the
// project's secret key are injected automatically; no other secrets.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretKey } from "../_shared/keys.ts";
import { merchantKey, parseAmountNumber, parseCurrency } from "../_shared/money.ts";

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

const DEFAULT_CURRENCY = "PLN";
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function check(error: { message: string } | null, what: string) {
  if (error) {
    console.error(`expense-import: ${what} failed`, error.message);
    throw new HttpError(500, "Server error");
  }
}

/** A value for an `ilike` pattern that matches only itself. */
function exactPattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await importPayment(req);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("expense-import: unhandled", err);
    return json({ error: "Server error" }, 500);
  }
});

async function importPayment(req: Request): Promise<Response> {
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
  const text = (name: string) => {
    const v = field(name);
    return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  };

  const token = text("token");
  if (!token) return json({ error: "token is required" }, 400);

  const merchant = text("merchant").replace(/\s+/g, " ").slice(0, 200);
  if (!merchant) return json({ error: "merchant is required" }, 400);
  const rawAmount = field("amount");
  const amount = parseAmountNumber(rawAmount);
  if (amount === null || amount === 0) return json({ error: "amount must be a number, like 45,00 zł" }, 400);
  if (Math.abs(amount) >= 1e10) return json({ error: "amount is too large" }, 400);
  const card = text("card").slice(0, 100) || null;

  const { data: tok, error: tokErr } = await admin.from("expense_import_tokens").select("owner_id").eq("token", token).maybeSingle();
  check(tokErr, "token lookup");
  if (!tok) return json({ error: "Unknown token" }, 401);
  const ownerId = tok.owner_id as string;

  const explicitCurrency = text("currency").toUpperCase();
  let currency = /^[A-Z]{3}$/.test(explicitCurrency) ? explicitCurrency : typeof rawAmount === "string" ? parseCurrency(rawAmount) : null;

  const { data: previous, error: prevErr } = await admin
    .from("expenses")
    .select("category_id, currency")
    .eq("user_id", ownerId)
    .ilike("merchant", exactPattern(merchant))
    .order("spent_at", { ascending: false })
    .limit(20);
  check(prevErr, "merchant lookup");
  const sameMerchant = (previous ?? []) as { category_id: string | null; currency: string }[];
  const categoryId = sameMerchant.find((r) => r.category_id)?.category_id ?? null;

  if (!currency) {
    const { data: latest, error: latestErr } = await admin
      .from("expenses")
      .select("currency")
      .eq("user_id", ownerId)
      .order("spent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check(latestErr, "currency lookup");
    currency = (latest?.currency as string | undefined) ?? DEFAULT_CURRENCY;
  }

  const now = Date.now();
  const { data: recent, error: recentErr } = await admin
    .from("expenses")
    .select("id, merchant, amount, currency")
    .eq("user_id", ownerId)
    .eq("currency", currency)
    .gte("spent_at", new Date(now - DUPLICATE_WINDOW_MS).toISOString());
  check(recentErr, "duplicate check");
  const duplicate = (recent ?? []).find(
    (r) => merchantKey(r.merchant as string) === merchantKey(merchant) && Number(r.amount) === amount,
  );
  if (duplicate) return json({ ok: true, duplicate: true, id: duplicate.id });

  const nowIso = new Date(now).toISOString();
  const { data: saved, error: insertErr } = await admin
    .from("expenses")
    .insert({
      user_id: ownerId,
      spent_at: nowIso,
      merchant,
      amount,
      currency,
      category_id: categoryId,
      source: "card",
      card,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  check(insertErr, "insert");

  await admin.from("expense_import_tokens").update({ last_used_at: nowIso }).eq("token", token);
  return json({ ok: true, id: saved!.id, merchant, amount, currency, categorised: categoryId !== null });
}
