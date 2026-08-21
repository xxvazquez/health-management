// Checked every 15 minutes by pg_cron + pg_net (see supabase/schema.sql's
// "Reminders" section). Still named breakfast-reminder-cron — it now walks
// every supplement/habit item's own reminder_time instead of one fixed
// breakfast check, but the deployed function name is a live URL an
// existing pg_cron job already calls, so renaming it would need that
// schedule re-pointed by hand too; see the schema.sql comment.
//
// For every push subscription, for every one of that user's supplement/
// habit items with a reminder_time set, sends a push once local time
// reaches that item's reminder_time (no upper bound — a late or skipped
// cron tick still sends, just later, rather than silently never sending
// that day) unless it's already logged today or already resolved today.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase for every Edge Function; only the VAPID keys need to be set by
// hand (see .github/workflows/deploy-functions.yml).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const vapidSubject = Deno.env.get("VAPID_SUBJECT") || `mailto:${Deno.env.get("BUG_EMAIL") || "support@lauva.pl"}`;
webpush.setVapidDetails(vapidSubject, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

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

  return new Response(JSON.stringify({ checked, sent }), { headers: { "Content-Type": "application/json" } });
});
