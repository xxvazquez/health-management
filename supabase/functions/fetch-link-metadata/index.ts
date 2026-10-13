// Fetches a URL server-side and returns its page title, for the Household
// Wishlist "add link" form — the static client can't do this itself (CORS).
// Only for a signed-in user: the public key alone passes the platform's JWT
// gate, so the caller's session is checked here.
// Deployed by .github/workflows/deploy-functions.yml. No secrets needed.
//
// The client treats any non-200 or a null title as "couldn't get it" and
// falls back to a hand-typed title, so this never has to be reachable for
// the feature to work.

import { createClient } from "npm:@supabase/supabase-js@2";
import { publishableKey } from "../_shared/keys.ts";
import { fetchPageTitle } from "../_shared/linkTitle.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKey();
  if (!supabaseUrl || !anonKey) return json({ error: "Server not configured" }, 500);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: callerUser } = await caller.auth.getUser();
  if (!callerUser?.user) return json({ error: "Not authenticated" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) return json({ error: "url is required" }, 400);

  return json({ title: await fetchPageTitle(rawUrl) });
});
