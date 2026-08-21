// Sends a bug report by email via Resend. Deployed by
// .github/workflows/deploy-functions.yml, which also syncs BUG_EMAIL and
// RESEND_API_KEY from GitHub Actions secrets into this function's Supabase
// secrets — neither value is ever part of the static site build.

const BUG_TYPES = new Set(["Wrong data", "Sync issue", "Display / layout", "Crash / error", "Other"]);

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const bugType = typeof body.bugType === "string" ? body.bugType.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const page = typeof body.page === "string" ? body.page.trim() : "unknown";
  const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
  const userAgent = typeof body.userAgent === "string" ? body.userAgent.trim() : "unknown";

  if (!BUG_TYPES.has(bugType) || !location) {
    return json({ error: "bugType and location are required" }, 400);
  }

  const bugEmail = Deno.env.get("BUG_EMAIL");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!bugEmail || !resendApiKey) {
    console.error("report-bug: BUG_EMAIL or RESEND_API_KEY not set");
    return json({ error: "Server not configured" }, 500);
  }

  const text = [
    `Type: ${bugType}`,
    `Location: ${location}`,
    `Page: ${page}`,
    `Reported: ${timestamp}`,
    `User agent: ${userAgent}`,
    "",
    comment ? `Comment:\n${comment}` : "No additional comment.",
  ].join("\n");

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("BUG_REPORT_FROM") ?? "Lauva Bug Reports <onboarding@resend.dev>",
      to: bugEmail,
      subject: `[Lauva bug report] ${bugType} — ${location}`,
      text,
    }),
  });

  if (!resendRes.ok) {
    console.error("report-bug: Resend request failed", resendRes.status, await resendRes.text());
    return json({ error: "Failed to send report" }, 502);
  }

  return json({ ok: true });
});
