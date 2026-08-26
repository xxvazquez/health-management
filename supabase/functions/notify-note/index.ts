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
  note: "Note",
  reminder: "Reminder",
  appreciation: "Appreciation",
  question: "Question",
};

// Same Notes accent as the app itself (--series-magenta in globals.css),
// plus the app's own brand-mint background — this should look like it came
// from Lauva, not a generic transactional-email template.
const ACCENT = "#9d43a3";
const MINT = "#e6f1f2";
const TEXT_PRIMARY = "#24313a";
const TEXT_SECONDARY = "#57666d";
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** "andrzejzuk93@example.com" -> "Andrzejzuk93" — same rule
 * src/components/auth/AccountPanel.tsx uses for the account menu's own
 * greeting, duplicated here rather than shared since an Edge Function is a
 * separate Deno module with no access to the Next app's source tree. A
 * name, even a guessed one, reads as an actual message from someone; a raw
 * email address in a sentence like "x@y.com sent you a note" doesn't. */
function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmail(opts: { senderName: string; isReply: boolean; categoryLabel: string; subject: string | null; preview: string; threadUrl: string }) {
  const { senderName, isReply, categoryLabel, subject, preview, threadUrl } = opts;
  const heading = isReply ? `${senderName} replied to a note` : `${senderName} sent you a note`;
  const subjectLine = isReply ? `${senderName} replied on Lauva` : `${senderName} sent you a ${categoryLabel.toLowerCase()} on Lauva`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:${MINT};font-family:${FONT_STACK};">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="padding-bottom:20px;text-align:center;">
          <span style="font-size:15px;font-weight:600;letter-spacing:0.2em;color:${TEXT_PRIMARY};">LAUVA</span>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(36,49,58,0.08);">
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${ACCENT}22;color:${ACCENT};font-size:12px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;">
            ${escapeHtml(categoryLabel)}${isReply ? " · Reply" : ""}
          </span>
          <h1 style="margin:14px 0 4px;font-size:19px;line-height:1.3;color:${TEXT_PRIMARY};font-weight:600;">
            ${escapeHtml(heading)}
          </h1>
          ${subject ? `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${TEXT_PRIMARY};">${escapeHtml(subject)}</p>` : ""}
          <p style="margin:0 0 22px;padding:14px 16px;background:${MINT};border-radius:10px;font-size:14px;line-height:1.6;color:${TEXT_SECONDARY};white-space:pre-wrap;">${escapeHtml(preview)}</p>
          <a href="${threadUrl}" style="display:inline-block;padding:10px 20px;border-radius:8px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
            Open in Lauva
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding-top:20px;text-align:center;font-size:12px;color:${TEXT_SECONDARY};">
          Private notes between you and your partner on Lauva.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [heading, "", subject ?? null, preview, "", `Open in Lauva: ${threadUrl}`].filter((l): l is string => l !== null).join("\n");

  return { subjectLine, html, text };
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
  const senderName = sender?.user?.email ? displayNameFromEmail(sender.user.email) : "Your partner";
  const categoryLabel = CATEGORY_LABEL[note.category as string] ?? "Note";
  const appUrl = Deno.env.get("NOTES_APP_URL") ?? "https://lauva.pl";
  const threadRootId = (note.thread_root_id as string | null) ?? note.id;
  const threadUrl = `${appUrl}/notes?thread=${threadRootId}`;
  const preview = typeof note.body === "string" ? note.body.slice(0, 400) : "";

  const { subjectLine, html, text } = buildEmail({
    senderName,
    isReply,
    categoryLabel,
    subject: typeof note.subject === "string" ? note.subject : null,
    preview,
    threadUrl,
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTES_FROM") ?? "Lauva <onboarding@resend.dev>",
      to: recipientEmail,
      subject: subjectLine,
      html,
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
