import { supabase } from "./client";
import { upsertDirect, deleteWhereDirect } from "./directWrite";
import type { TrackedDomain } from "@/lib/visibleDomains";

const TABLE = "habit_reminders";

/** Domain -> its reminder time ("HH:MM"), for every domain that currently
 * has one set. A domain absent from the map has no reminder. */
export type HabitReminderTimes = Partial<Record<TrackedDomain, string>>;

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchHabitReminderTimes(): Promise<HabitReminderTimes> {
  if (!supabase) return {};
  const myUserId = await currentUserId();
  if (!myUserId) return {};
  const { data, error } = await supabase.from(TABLE).select("domain, reminder_time").eq("user_id", myUserId);
  if (error) throw error;
  const result: HabitReminderTimes = {};
  for (const row of (data ?? []) as { domain: TrackedDomain; reminder_time: string }[]) {
    result[row.domain] = row.reminder_time.slice(0, 5);
  }
  return result;
}

/** Sets (or clears, on `time: null`) the "remind me to log this" time for
 * one domain — one row per (user, domain), so this upserts/deletes on that
 * pair rather than a surrogate id. Resets `reminder_last_sent_date` on every
 * set, same reasoning as `setItemReminderTimeAndSync`: a new schedule
 * invalidates whatever the cron already resolved under the old one. Offline
 * / mid-outage it queues; see directWrite.ts. */
export async function setHabitReminderTime(domain: TrackedDomain, time: string | null): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  if (time === null) {
    await deleteWhereDirect(myUserId, TABLE, { user_id: myUserId, domain });
    return;
  }
  await upsertDirect(myUserId, TABLE, `${myUserId}:${domain}`, {
    user_id: myUserId,
    domain,
    reminder_time: time,
    reminder_last_sent_date: null,
    updated_at: new Date().toISOString(),
  });
}
