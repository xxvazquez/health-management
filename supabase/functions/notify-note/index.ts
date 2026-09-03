// Sends the recipient of a message an immediate web push when a new note or
// reply arrives. Called by the client (see src/lib/supabase/notes.ts) right
// after inserting the row, fire-and-forget — a failed send here never blocks
// the message from being saved, and the reminder-cron's daily digest still
// covers anyone without push enabled.
//
// Push only, no email: the per-message email this function used to send was
// dropped for being noisy (see reminder-cron's notes-digest phase). The push
// carries no subject or body, only that something arrived — read it in Lauva.
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// into every Edge Function automatically; only the VAPID keys need setting by
// hand (see .github/workflows/deploy-functions.yml).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const vapidSubject = Deno.env.get("VAPID_SUBJECT") || `mailto:${Deno.env.get("BUG_EMAIL") || "support@lauva.pl"}`;
webpush.setVapidDetails(vapidSubject, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

/** "X sent you a message" name — a nickname from auth metadata if set, else
 * a capitalised email local-part, else a generic label. Mirrors the app's
 * own AccountPanel greeting rule and reminder-cron's getUserDisplayName. */
function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  for (const key of ["display_name", "name", "full_name", "nickname"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (user?.email) {
    const local = user.email.split("@")[0] ?? user.email;
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "Your partner";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !Deno.env.get("VAPID_PUBLIC_KEY")) {
    console.error("notify-note: missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / VAPID_PUBLIC_KEY");
    return json({ error: "Server not configured" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const noteId = typeof body.noteId === "string" ? body.noteId : "";
  if (!noteId) return json({ error: "noteId is required" }, 400);

  // Verify the caller is the message's sender — the push says nothing
  // private, but this keeps a stranger from poking a known noteId to ping
  // someone's phone.
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerUser } = await caller.auth.getUser();
  const callerId = callerUser?.user?.id;
  if (!callerId) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: note, error: noteError } = await admin
    .from("notes")
    .select("id, sender_id, recipient_id, thread_root_id")
    .eq("id", noteId)
    .single();
  if (noteError || !note) return json({ error: "Note not found" }, 404);
  if (note.sender_id !== callerId) return json({ error: "Not the sender" }, 403);

  const { data: sub } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", note.recipient_id)
    .maybeSingle();
  // No subscription is a normal case — email digest is the fallback channel.
  if (!sub) return json({ ok: true, skipped: "no subscription" });

  const { data: sender } = await admin.auth.admin.getUserById(note.sender_id);
  const senderName = displayName(sender?.user);
  const isReply = Boolean(note.thread_root_id);
  const threadRootId = (note.thread_root_id as string | null) ?? note.id;

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({
        title: isReply ? `${senderName} replied` : `${senderName} sent you a message`,
        body: "",
        tag: `note:${threadRootId}`,
        url: `/notes?thread=${threadRootId}`,
      }),
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await admin.from("push_subscriptions").delete().eq("user_id", note.recipient_id);
      return json({ ok: true, skipped: "stale subscription dropped" });
    }
    console.error("notify-note: push failed", err);
    return json({ error: "Failed to send push" }, 502);
  }

  return json({ ok: true });
});
