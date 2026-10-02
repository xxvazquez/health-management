// Sends the recipient of a message an immediate web push when a new note or
// reply arrives. Called by the client (see src/lib/supabase/notes.ts) right
// after inserting the row, fire-and-forget — a failed send here never blocks
// the message from being saved, and the reminder-cron's daily digest still
// covers anyone without push enabled.
//
// With `remind: true` and a thread's root id it instead re-pushes the other
// participant about a thread they haven't read since its latest message —
// the Sent side's "Remind" action. A thread they've already read is refused.
//
// Push only, no email: the per-message email this function used to send was
// dropped for being noisy (see reminder-cron's notes-digest phase). The push
// carries no subject or body, only that something arrived — read it in Lauva.
//
// SUPABASE_URL and the project's publishable and secret keys are injected
// into every Edge Function automatically; only the VAPID keys need setting by
// hand (see .github/workflows/deploy-functions.yml).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { publishableKey, secretKey } from "../_shared/keys.ts";

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
  const anonKey = publishableKey();
  const serviceRoleKey = secretKey();
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !Deno.env.get("VAPID_PUBLIC_KEY")) {
    console.error("notify-note: missing SUPABASE_URL / publishable key / secret key / VAPID_PUBLIC_KEY");
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
  const remind = body.remind === true;

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
    .select("id, sender_id, recipient_id, thread_root_id, last_message_at, sender_read_at, recipient_read_at")
    .eq("id", noteId)
    .single();
  if (noteError || !note) return json({ error: "Note not found" }, 404);

  // The person being pushed: a new message's recipient, or for a reminder
  // whichever participant of the thread isn't the caller.
  let targetId: string;
  if (remind) {
    if (note.thread_root_id) return json({ error: "Remind takes a thread's root id" }, 400);
    if (note.sender_id !== callerId && note.recipient_id !== callerId) return json({ error: "Not a participant" }, 403);
    const targetIsSender = note.sender_id !== callerId;
    targetId = targetIsSender ? note.sender_id : note.recipient_id;
    const readAt = targetIsSender ? note.sender_read_at : note.recipient_read_at;
    if (readAt && readAt >= note.last_message_at) return json({ error: "Already read" }, 409);
  } else {
    if (note.sender_id !== callerId) return json({ error: "Not the sender" }, 403);
    targetId = note.recipient_id;
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", targetId);
  // No subscription is a normal case — email digest is the fallback channel.
  if (!subs || subs.length === 0) return json({ ok: true, skipped: "no subscription" });

  const { data: sender } = await admin.auth.admin.getUserById(callerId);
  const senderName = displayName(sender?.user);
  const isReply = Boolean(note.thread_root_id);
  const threadRootId = (note.thread_root_id as string | null) ?? note.id;
  const payload = JSON.stringify({
    title: senderName,
    body: remind ? "Reminded you about an unread message" : isReply ? "Replied to your message" : "Sent you a message",
    tag: `note:${threadRootId}`,
    url: `/notes?thread=${threadRootId}`,
  });

  // The recipient may have push enabled on more than one device — send to
  // every one of theirs, independently, rather than stopping at the first.
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("user_id", targetId).eq("endpoint", sub.endpoint);
      } else {
        console.error("notify-note: push failed", err);
      }
    }
  }

  return json({ ok: true });
});
