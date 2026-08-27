// Checked every 15 minutes by pg_cron + pg_net (see supabase/schema.sql's
// "Reminders" section). Still named breakfast-reminder-cron — it now walks
// every supplement/habit item's own reminder_time instead of one fixed
// breakfast check, but the deployed function name is a live URL an
// existing pg_cron job already calls, so renaming it would need that
// schedule re-pointed by hand too; see the schema.sql comment.
//
// Two independent phases:
// 1. For every push subscription, for every one of that user's supplement/
//    habit items with a reminder_time set, sends a push once local time
//    reaches that item's reminder_time (no upper bound — a late or skipped
//    cron tick still sends, just later, rather than silently never sending
//    that day) unless it's already logged today or already resolved today.
// 2. Personal Reminders / Home: scans personal_tasks/household_tasks (by
//    due_at) and household_items (by expires_on - remind_days_before) for
//    due, not-yet-sent rows, and sends both an email (Resend, same as
//    notify-note) and a push. A Home task assigned to one partner
//    (assigned_to set) notifies only that person; an unassigned task, and
//    every Home item, notifies both linked partners. See isTaskRowDue/
//    isItemRowDue below.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase for every Edge Function; only the VAPID keys (and RESEND_API_KEY,
// already set for notify-note) need to be set by hand (see
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
    console.error("breakfast-reminder-cron: reminder email failed", res.status, await res.text());
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
      console.error("breakfast-reminder-cron: push failed for", userId, tag, err);
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
    console.error(`breakfast-reminder-cron: failed to stamp reminder_last_sent_date for ${itemTable}:${itemId}`, error);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) {
    console.error("breakfast-reminder-cron: failed to load subscriptions", error);
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
          console.error("breakfast-reminder-cron: send failed for", sub.user_id, item.id, err);
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

  const { data: personalTasks } = await supabase.from("personal_tasks").select("id, user_id, title, due_at, reminder_sent_at").not("due_at", "is", null).is("reminder_sent_at", null);
  for (const task of (personalTasks ?? []) as { id: string; user_id: string; title: string; due_at: string | null; reminder_sent_at: string | null }[]) {
    dueChecked++;
    if (!isTaskRowDue(task.due_at, task.reminder_sent_at, nowDate)) continue;
    const email = await getUserEmail(task.user_id);
    if (email) await sendReminderEmail(email, `Reminder: ${task.title}`, `"${task.title}" is due on Lauva.`);
    await sendPushToUser(subsByUser, task.user_id, `Due: ${task.title}`, `personal-task:${task.id}`);
    await supabase.from("personal_tasks").update({ reminder_sent_at: nowDate.toISOString() }).eq("id", task.id);
    dueSent++;
  }

  const { data: householdTasks } = await supabase.from("household_tasks").select("id, owner_id, title, due_at, reminder_sent_at, assigned_to").not("due_at", "is", null).is("reminder_sent_at", null);
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

  return new Response(JSON.stringify({ checked, sent, dueChecked, dueSent }), { headers: { "Content-Type": "application/json" } });
});
