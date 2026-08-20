// Checked every 15 minutes by pg_cron + pg_net (see supabase/schema.sql,
// "Breakfast reminder" section) — not a general scheduler, just this one
// job. For every enabled subscription whose local time has just entered
// its reminder window, sends a push unless breakfast is already logged
// today. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by Supabase for every Edge Function; only the VAPID keys
// need to be set by hand (see .github/workflows/deploy-functions.yml).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const vapidSubject = Deno.env.get("VAPID_SUBJECT") || `mailto:${Deno.env.get("BUG_EMAIL") || "support@lauva.pl"}`;
webpush.setVapidDetails(vapidSubject, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

// Default reminder time: before 11:00 AM. A 15-minute-wide window matching
// the cron cadence, so no run is missed between checks.
const WINDOW_START_MINUTES = 10 * 60 + 30; // 10:30
const WINDOW_END_MINUTES = 10 * 60 + 45; // 10:45, exclusive

function localNow(timezone: string): { date: string; minutesSinceMidnight: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutesSinceMidnight: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

interface Subscription {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  timezone: string;
  last_reminded_date: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) {
    console.error("breakfast-reminder-cron: failed to load subscriptions", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  for (const sub of (subs ?? []) as Subscription[]) {
    let local: { date: string; minutesSinceMidnight: number };
    try {
      local = localNow(sub.timezone);
    } catch {
      continue; // unrecognized timezone string — skip rather than fail the whole run
    }

    if (local.minutesSinceMidnight < WINDOW_START_MINUTES || local.minutesSinceMidnight >= WINDOW_END_MINUTES) continue;
    if (sub.last_reminded_date === local.date) continue;

    const { data: breakfastLogs } = await supabase
      .from("food_logs")
      .select("id")
      .eq("user_id", sub.user_id)
      .eq("date", local.date)
      .eq("meal_tag", "Breakfast")
      .limit(1);

    if (breakfastLogs && breakfastLogs.length > 0) {
      await supabase.from("push_subscriptions").update({ last_reminded_date: local.date }).eq("user_id", sub.user_id);
      continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({
          title: "Log breakfast?",
          body: "You haven't logged breakfast yet today.",
          tag: "breakfast-reminder",
        }),
      );
      sent++;
      await supabase.from("push_subscriptions").update({ last_reminded_date: local.date }).eq("user_id", sub.user_id);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription no longer valid (permission revoked, browser data
        // cleared) — drop it instead of retrying it forever.
        await supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id);
      } else {
        console.error("breakfast-reminder-cron: send failed for", sub.user_id, err);
      }
    }
  }

  return new Response(JSON.stringify({ checked: subs?.length ?? 0, sent }), { headers: { "Content-Type": "application/json" } });
});
