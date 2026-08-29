// Runs every 15 minutes via pg_cron + pg_net (see supabase/schema.sql's
// "Reminders" section for the schedule).
//
// Three independent phases:
// 1. For every push subscription, for every one of that user's supplement/
//    habit items with a reminder_time set, sends a push once local time
//    reaches that item's reminder_time (no upper bound — a late or skipped
//    cron tick still sends, just later, rather than silently never sending
//    that day) unless it's already logged today or already resolved today.
// 2. Personal Reminders / Home: scans personal_tasks/household_tasks (by
//    due_at), personal_items/household_items (by expires_on -
//    remind_days_before), and doctor_appointment_tasks (by reminder_at) for
//    due, not-yet-sent rows, and sends both an email (Resend) and a push. A
//    Home task assigned to one partner (assigned_to set) notifies only that
//    person; an unassigned task, and every Home item, notifies both linked
//    partners. See isTaskRowDue/isItemRowDue below.
// 3. Notes digest: once per day, after 09:00 in DIGEST_TIMEZONE (defaults
//    to Europe/Warsaw), emails + pushes each linked user a single "you
//    have N unread notes from <name>" summary — instead of a mail per
//    message. notes_digest_state stops it re-sending the same day.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase for every Edge Function; only the VAPID keys, RESEND_API_KEY,
// NOTES_FROM/REMINDERS_FROM, and (optionally) DIGEST_TIMEZONE need to be
// set by hand (see
// .github/workflows/deploy-functions.yml).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const vapidSubject = Deno.env.get("VAPID_SUBJECT") || `mailto:${Deno.env.get("BUG_EMAIL") || "support@lauva.pl"}`;
webpush.setVapidDetails(vapidSubject, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

// Same Resend account notify-note already uses (RESEND_API_KEY is a
// project-wide Edge Function secret, not per-function) — reminder emails
// just aren't sent if it's unset, rather than failing the whole run; push
// still goes out either way.
const resendApiKey = Deno.env.get("RESEND_API_KEY");

/** Pure — no Supabase/webpush I/O — so the actual scheduling math is
 * reasoned about (and unit-testable, if a Deno test harness is ever added
 * to this repo) independent of the surrounding I/O. `now` is injectable
 * rather than read from the clock internally for the same reason. */
export function localNow(timezone: string, now: Date = new Date()): { date: string; minutesSinceMidnight: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutesSinceMidnight: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** No upper bound deliberately — a fixed window (the old design's 10:30-
 * 10:45) means a single late or skipped cron tick silently drops that
 * day's reminder entirely. Once local time reaches reminderTime and it
 * hasn't already resolved today, it's due, however late "now" actually is. */
export function isReminderDue(nowMinutes: number, reminderTime: string, lastSentDate: string | null, today: string): boolean {
  if (lastSentDate === today) return false;
  const [h, m] = reminderTime.split(":").map(Number);
  return nowMinutes >= h * 60 + m;
}

/** Due-detection for a personal_tasks/household_tasks row — mirrors
 * src/lib/reminders.ts's `isTaskDue`, duplicated rather than imported since
 * this Edge Function is a standalone Deno bundle with no access to the
 * Next app's source tree (same reasoning `localNow`/`isReminderDue` above
 * already document). Idempotency is `reminder_sent_at` itself, not date
 * math: once sent it's null no more, and stays that way until the task's
 * own completion flow (see completePersonalTask/completeHouseholdTask)
 * clears it for the next occurrence. */
export function isTaskRowDue(dueAt: string | null, reminderSentAt: string | null, now: Date = new Date()): boolean {
  if (!dueAt || reminderSentAt) return false;
  return new Date(dueAt).getTime() <= now.getTime();
}

function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Due-detection for a household_items row — mirrors `expirationBucket`'s
 * "expired or soon" condition in src/lib/reminders.ts (same duplication
 * reasoning as isTaskRowDue above): due once today has reached the item's
 * own remind-before window, i.e. expires_on <= today + remind_days_before. */
export function isItemRowDue(expiresOn: string, remindDaysBefore: number, reminderSentAt: string | null, today: string): boolean {
  if (reminderSentAt) return false;
  return expiresOn <= addDaysToDateString(today, remindDaysBefore);
}

async function sendReminderEmail(toEmail: string, subject: string, bodyText: string): Promise<void> {
  if (!resendApiKey) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("REMINDERS_FROM") ?? Deno.env.get("NOTES_FROM") ?? "Lauva <onboarding@resend.dev>",
      to: toEmail,
      subject,
      text: bodyText,
    }),
  });
  if (!res.ok) {
    console.error("reminder-cron: reminder email failed", res.status, await res.text());
  }
}

/** Pushes to one user if they have a subscription, dropping it on a 404/410
 * exactly like the per-item loop above. Returns whether a push subscription
 * existed at all (not whether the send succeeded) — a user with no push
 * subscription is a normal, expected case (email is the reliable channel),
 * not something worth logging as a failure. */
async function sendPushToUser(subsByUser: Map<string, Subscription>, userId: string, title: string, tag: string): Promise<void> {
  const sub = subsByUser.get(userId);
  if (!sub) return;
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, JSON.stringify({ title, body: "", tag }));
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("user_id", userId);
      subsByUser.delete(userId);
    } else {
      console.error("reminder-cron: push failed for", userId, tag, err);
    }
  }
}

/** The given user's linked partner id, or null — same lookup
 * `get_partner_email` does at the DB layer, done here in JS since this
 * function already holds a service-role client with no RLS to route
 * through. An unassigned Home task (and every Home item) reminds both
 * members, since either can act on it (see household_tasks_update_pair);
 * an assigned task reminds only assigned_to. */
async function getPartnerId(userId: string): Promise<string | null> {
  const { data } = await supabase.from("partner_links").select("user_a_id, user_b_id").or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`).maybeSingle();
  if (!data) return null;
  return data.user_a_id === userId ? data.user_b_id : data.user_a_id;
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/** "X sent you a note" name — a nickname from auth metadata if set, else a
 * capitalised email local-part, else a generic label. Mirrors the app's
 * own AccountPanel greeting rule. */
async function getUserDisplayName(userId: string): Promise<string> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ["display_name", "name", "full_name", "nickname"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const email = data?.user?.email;
  if (email) {
    const local = email.split("@")[0] ?? email;
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "your partner";
}

interface Subscription {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  timezone: string;
}

interface ReminderItemRow {
  id: string;
  name: string;
  reminder_time: string;
  reminder_last_sent_date: string | null;
}

const REMINDER_SOURCES = [
  { itemTable: "supplement_items", logTable: "supplement_logs" },
  { itemTable: "habit_items", logTable: "habit_logs" },
] as const;

/** Stamps reminder_last_sent_date so a resolved item isn't re-evaluated on
 * the next tick. This is a separate operation from whatever resolved it
 * (a successful send, or an already-logged skip) — there's no transaction
 * spanning a webpush.sendNotification call and a Postgres update, so a
 * send can succeed and this can still fail. That gap is accepted, not
 * hidden: logged here so it's visible in the Function's logs, and left to
 * self-heal on the next tick (worst case, one extra notification for that
 * one item — collapsed to a single on-screen notification by its `tag`
 * either way) rather than retried in-process or stamped before sending
 * (which would trade a rare possible duplicate for a rare possible silent
 * miss if the send itself then failed — a worse trade for a reminder). */
async function markResolved(itemTable: string, itemId: string, date: string): Promise<void> {
  const { error } = await supabase.from(itemTable).update({ reminder_last_sent_date: date }).eq("id", itemId);
  if (error) {
    console.error(`reminder-cron: failed to stamp reminder_last_sent_date for ${itemTable}:${itemId}`, error);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) {
    console.error("reminder-cron: failed to load subscriptions", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let checked = 0;
  let sent = 0;
  for (const sub of (subs ?? []) as Subscription[]) {
    let local: { date: string; minutesSinceMidnight: number };
    try {
      local = localNow(sub.timezone);
    } catch {
      continue; // unrecognized timezone string — skip rather than fail the whole run
    }

    let subscriptionValid = true;
    for (const { itemTable, logTable } of REMINDER_SOURCES) {
      if (!subscriptionValid) break;

      const { data: items } = await supabase
        .from(itemTable)
        .select("id, name, reminder_time, reminder_last_sent_date")
        .eq("user_id", sub.user_id)
        .eq("is_archived", false)
        .not("reminder_time", "is", null);

      for (const item of (items ?? []) as ReminderItemRow[]) {
        checked++;
        const reminderTime = item.reminder_time.slice(0, 5);
        if (!isReminderDue(local.minutesSinceMidnight, reminderTime, item.reminder_last_sent_date, local.date)) continue;

        const { data: logs } = await supabase.from(logTable).select("id").eq("user_id", sub.user_id).eq("item_id", item.id).eq("date", local.date).limit(1);
        if (logs && logs.length > 0) {
          await markResolved(itemTable, item.id, local.date);
          continue;
        }

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            JSON.stringify({ title: `Time for ${item.name}`, body: "", tag: `reminder:${item.id}` }),
          );
          sent++;
          await markResolved(itemTable, item.id, local.date);
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription no longer valid (permission revoked, browser
            // data cleared) — drop it instead of retrying it forever, and
            // stop checking this subscription's remaining items this run.
            await supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id);
            subscriptionValid = false;
            break;
          }
          console.error("reminder-cron: send failed for", sub.user_id, item.id, err);
        }
      }
    }
  }

  // --- Personal/Home tasks + Home product expiration -----------------
  // Due-date driven (not the daily local-time-of-day check above), so this
  // scans each table directly instead of per-subscription: a task/item is
  // either due right now or it isn't, regardless of whose subscription
  // happens to be loaded. reminder_sent_at is the sole idempotency guard —
  // see isTaskRowDue/isItemRowDue's own comments.
  const subsByUser = new Map<string, Subscription>((subs ?? []).map((s: Subscription) => [s.user_id, s]));
  const nowDate = new Date();
  const today = localNow("UTC", nowDate).date;
  let dueChecked = 0;
  let dueSent = 0;

  // Archived tasks (is_archived) are retired — never remind on them.
  const { data: personalTasks } = await supabase
    .from("personal_tasks")
    .select("id, user_id, title, due_at, reminder_sent_at")
    .eq("is_archived", false)
    .not("due_at", "is", null)
    .is("reminder_sent_at", null);
  for (const task of (personalTasks ?? []) as { id: string; user_id: string; title: string; due_at: string | null; reminder_sent_at: string | null }[]) {
    dueChecked++;
    if (!isTaskRowDue(task.due_at, task.reminder_sent_at, nowDate)) continue;
    const email = await getUserEmail(task.user_id);
    if (email) await sendReminderEmail(email, `Reminder: ${task.title}`, `"${task.title}" is due on Lauva.`);
    await sendPushToUser(subsByUser, task.user_id, `Due: ${task.title}`, `personal-task:${task.id}`);
    await supabase.from("personal_tasks").update({ reminder_sent_at: nowDate.toISOString() }).eq("id", task.id);
    dueSent++;
  }

  const { data: householdTasks } = await supabase
    .from("household_tasks")
    .select("id, owner_id, title, due_at, reminder_sent_at, assigned_to")
    .eq("is_archived", false)
    .not("due_at", "is", null)
    .is("reminder_sent_at", null);
  for (const task of (householdTasks ?? []) as { id: string; owner_id: string; title: string; due_at: string | null; reminder_sent_at: string | null; assigned_to: string | null }[]) {
    dueChecked++;
    if (!isTaskRowDue(task.due_at, task.reminder_sent_at, nowDate)) continue;
    // Assigned to one partner -> only they hear about it; unassigned ->
    // both members, since either can complete it.
    const recipientIds = task.assigned_to
      ? [task.assigned_to]
      : [task.owner_id, await getPartnerId(task.owner_id)].filter((id): id is string => id != null);
    for (const userId of recipientIds) {
      const email = await getUserEmail(userId);
      if (email) await sendReminderEmail(email, `Home reminder: ${task.title}`, `"${task.title}" is due in Home on Lauva.`);
      await sendPushToUser(subsByUser, userId, `Home: ${task.title}`, `household-task:${task.id}`);
    }
    await supabase.from("household_tasks").update({ reminder_sent_at: nowDate.toISOString() }).eq("id", task.id);
    dueSent++;
  }

  const { data: householdItems } = await supabase.from("household_items").select("id, owner_id, name, expires_on, remind_days_before, reminder_sent_at").is("reminder_sent_at", null);
  for (const item of (householdItems ?? []) as { id: string; owner_id: string; name: string; expires_on: string; remind_days_before: number; reminder_sent_at: string | null }[]) {
    dueChecked++;
    if (!isItemRowDue(item.expires_on, item.remind_days_before, item.reminder_sent_at, today)) continue;
    const partnerId = await getPartnerId(item.owner_id);
    const expired = item.expires_on < today;
    const label = expired ? "expired" : "expiring soon";
    for (const userId of [item.owner_id, partnerId].filter((id): id is string => id != null)) {
      const email = await getUserEmail(userId);
      if (email) await sendReminderEmail(email, `${item.name} is ${label}`, `"${item.name}" (expires ${item.expires_on}) is ${label} — check Home on Lauva.`);
      await sendPushToUser(subsByUser, userId, `${item.name} is ${label}`, `household-item:${item.id}`);
    }
    await supabase.from("household_items").update({ reminder_sent_at: nowDate.toISOString() }).eq("id", item.id);
    dueSent++;
  }

  // personal_items — the private Expiration tab on the Log page. Same
  // due-check as household_items, but owner-only (no partner fan-out).
  const { data: personalItems } = await supabase
    .from("personal_items")
    .select("id, user_id, name, expires_on, remind_days_before, reminder_sent_at")
    .is("reminder_sent_at", null);
  for (const item of (personalItems ?? []) as { id: string; user_id: string; name: string; expires_on: string; remind_days_before: number; reminder_sent_at: string | null }[]) {
    dueChecked++;
    if (!isItemRowDue(item.expires_on, item.remind_days_before, item.reminder_sent_at, today)) continue;
    const label = item.expires_on < today ? "expired" : "expiring soon";
    const email = await getUserEmail(item.user_id);
    if (email) await sendReminderEmail(email, `${item.name} is ${label}`, `"${item.name}" (expires ${item.expires_on}) is ${label} — check Lauva.`);
    await sendPushToUser(subsByUser, item.user_id, `${item.name} is ${label}`, `personal-item:${item.id}`);
    await supabase.from("personal_items").update({ reminder_sent_at: nowDate.toISOString() }).eq("id", item.id);
    dueSent++;
  }

  // Doctor follow-up tasks — an optional one-off push/email once reminder_at
  // passes, same reminder_sent_at idempotency guard as the task rows above.
  // Independent phase; nothing here touches the reminder-cron schedule.
  const { data: doctorTasks } = await supabase
    .from("doctor_appointment_tasks")
    .select("id, user_id, description, reminder_at, reminder_sent_at, appointment_id")
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .is("completed_at", null);
  for (const task of (doctorTasks ?? []) as { id: string; user_id: string; description: string; reminder_at: string | null; reminder_sent_at: string | null; appointment_id: string }[]) {
    dueChecked++;
    if (!isTaskRowDue(task.reminder_at, task.reminder_sent_at, nowDate)) continue;
    const { data: appt } = await supabase.from("doctor_appointments").select("doctor_id").eq("id", task.appointment_id).maybeSingle();
    const { data: doctor } = appt
      ? await supabase.from("doctors").select("name").eq("id", (appt as { doctor_id: string }).doctor_id).maybeSingle()
      : { data: null };
    const doctorName = (doctor as { name: string } | null)?.name ?? "your doctor";
    const email = await getUserEmail(task.user_id);
    if (email) await sendReminderEmail(email, `Follow-up: ${task.description}`, `"${task.description}" — a follow-up from your visit with ${doctorName}.`);
    await sendPushToUser(subsByUser, task.user_id, `Follow-up: ${task.description}`, `doctor-task:${task.id}`);
    await supabase.from("doctor_appointment_tasks").update({ reminder_sent_at: nowDate.toISOString() }).eq("id", task.id);
    dueSent++;
  }

  // --- Phase 3: daily unread-notes digest ---------------------------
  // One "you have N unread notes from <partner>" per day, after 09:00 in
  // DIGEST_TIMEZONE — defaults to Europe/Warsaw (this app's users share one
  // zone); set the secret to override. notes_digest_state is stamped every
  // day it's evaluated, sent or not, so a user is checked at most once/day.
  let digestSent = 0;
  const digestLocal = localNow(Deno.env.get("DIGEST_TIMEZONE") ?? "Europe/Warsaw", nowDate);
  if (digestLocal.minutesSinceMidnight >= 9 * 60) {
    const { data: links } = await supabase.from("partner_links").select("user_a_id, user_b_id");
    const linkedUserIds = new Set<string>();
    for (const link of (links ?? []) as { user_a_id: string; user_b_id: string }[]) {
      linkedUserIds.add(link.user_a_id);
      linkedUserIds.add(link.user_b_id);
    }
    for (const userId of linkedUserIds) {
      const { data: state } = await supabase.from("notes_digest_state").select("last_sent_date").eq("user_id", userId).maybeSingle();
      if ((state as { last_sent_date: string | null } | null)?.last_sent_date === digestLocal.date) continue;

      const { data: roots } = await supabase
        .from("notes")
        .select("id, sender_id, recipient_id, last_message_at, sender_read_at, recipient_read_at")
        .is("thread_root_id", null)
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
      let unread = 0;
      for (const n of (roots ?? []) as {
        sender_id: string;
        recipient_id: string;
        last_message_at: string;
        sender_read_at: string | null;
        recipient_read_at: string | null;
      }[]) {
        const readAt = n.sender_id === userId ? n.sender_read_at : n.recipient_read_at;
        if (!readAt || readAt < n.last_message_at) unread++;
      }

      if (unread > 0) {
        const partnerId = await getPartnerId(userId);
        const partnerName = partnerId ? await getUserDisplayName(partnerId) : "your partner";
        const noun = unread === 1 ? "message" : "messages";
        const email = await getUserEmail(userId);
        if (email) {
          await sendReminderEmail(
            email,
            `${unread} unread ${noun} on Lauva`,
            `You have ${unread} unread ${noun} from ${partnerName}. Open Lauva to read ${unread === 1 ? "it" : "them"}.`,
          );
        }
        await sendPushToUser(subsByUser, userId, `${unread} unread ${noun} from ${partnerName}`, "notes-digest");
        digestSent++;
      }
      await supabase.from("notes_digest_state").upsert({ user_id: userId, last_sent_date: digestLocal.date, updated_at: nowDate.toISOString() });
    }
  }

  return new Response(JSON.stringify({ checked, sent, dueChecked, dueSent, digestSent }), { headers: { "Content-Type": "application/json" } });
});
