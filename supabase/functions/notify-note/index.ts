// Emails a Note's recipient when a new note or reply arrives. Called by the
// client (see src/lib/supabase/notes.ts) right after inserting a note row,
// fire-and-forget — a failed send here never blocks the note itself from
// being saved. Sends via Resend, same provider and RESEND_API_KEY as
// report-bug, but unlike report-bug (which always mails one fixed address)
// this needs a *user's* email, which the anon/authenticated client can
// never read off auth.users itself — hence the service-role client below,
// using the SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY Supabase injects into
// every Edge Function automatically (see breakfast-reminder-cron's own
// comment on this — nothing extra to configure for those two).

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

const CATEGORY_LABEL: Record<string, string> = {
  note: "note",
  reminder: "reminder",
  appreciation: "appreciation",
  question: "question",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const noteId = typeof body.noteId === "string" ? body.noteId : "";
  if (!noteId) return json({ error: "noteId is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("notify-note: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or RESEND_API_KEY not set");
    return json({ error: "Server not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: note, error: noteError } = await admin
    .from("notes")
    .select("id, sender_id, recipient_id, thread_root_id, category, subject, body, notified_at")
    .eq("id", noteId)
    .single();

  if (noteError || !note) {
    console.error("notify-note: note not found", noteId, noteError);
    return json({ error: "Note not found" }, 404);
  }
  // Already notified (e.g. a retried call after a flaky first attempt) —
  // succeed as a no-op instead of sending a duplicate email.
  if (note.notified_at) return json({ ok: true, skipped: "already notified" });

  const [{ data: recipient, error: recipientError }, { data: sender }] = await Promise.all([
    admin.auth.admin.getUserById(note.recipient_id),
    admin.auth.admin.getUserById(note.sender_id),
  ]);
  const recipientEmail = recipient?.user?.email;
  if (recipientError || !recipientEmail) {
    console.error("notify-note: could not resolve recipient email", note.recipient_id, recipientError);
    return json({ error: "Could not resolve recipient" }, 500);
  }

  const isReply = Boolean(note.thread_root_id);
  const senderLabel = sender?.user?.email ?? "Your partner";
  const categoryLabel = CATEGORY_LABEL[note.category as string] ?? "note";
  const appUrl = Deno.env.get("NOTES_APP_URL") ?? "https://lauva.pl";
  const subjectLine = isReply ? `${senderLabel} replied on Lauva` : `${senderLabel} sent you a ${categoryLabel} on Lauva`;

  const preview = typeof note.body === "string" ? note.body.slice(0, 500) : "";
  const text = [subjectLine, "", note.subject ? `Subject: ${note.subject}` : null, preview, "", `Read and reply: ${appUrl}/notes`]
    .filter((line): line is string => line !== null)
    .join("\n");

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTES_FROM") ?? "Lauva Notes <onboarding@resend.dev>",
      to: recipientEmail,
      subject: subjectLine,
      text,
    }),
  });

  if (!resendRes.ok) {
    console.error("notify-note: Resend request failed", resendRes.status, await resendRes.text());
    return json({ error: "Failed to send notification" }, 502);
  }

  await admin.from("notes").update({ notified_at: new Date().toISOString() }).eq("id", noteId);

  return json({ ok: true });
});
