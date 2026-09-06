import { isRecurringTask, isTaskDone, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import { addDaysToDate, daysBetween } from "@/lib/aggregations/common";
import type { DoctorFollowUpTask } from "@/lib/supabase/doctors";

export type AgendaKind = "reminder" | "expiry" | "followup" | "appointment";
export type AgendaScope = "mine" | "shared" | "medical";

/** Urgency bands, in display order. `later` = dated but > 7 days out;
 * `someday` = a reminder with no due date at all. */
export type AgendaBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "someday" | "done";

export const AGENDA_BUCKET_ORDER: AgendaBucket[] = ["overdue", "today", "tomorrow", "week", "later", "someday", "done"];

export const AGENDA_BUCKET_LABEL: Record<AgendaBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next 7 days",
  later: "Later",
  someday: "No date",
  done: "Done",
};

export interface AgendaEntry {
  key: string;
  kind: AgendaKind;
  scope: AgendaScope;
  bucket: AgendaBucket;
  title: string;
  subtitle?: string;
  /** ms of the due moment — orders rows within a bucket; null for `someday`. */
  dueMs: number | null;
  /** Scannable relative timing for the row ("yesterday", "9:00", "Wed"). */
  when: string;
  recurring?: boolean;
  /** The source record, present for the kinds Agenda can act on directly. */
  reminder?: TaskItem;
  expiry?: ExpirationItem;
  /** Where a read-only row (follow-up / appointment) opens on tap. */
  href?: string;
}

export interface AgendaSources {
  personalReminders: TaskItem[];
  sharedReminders: TaskItem[];
  personalExpiry: ExpirationItem[];
  sharedExpiry: ExpirationItem[];
  followUps: DoctorFollowUpTask[];
  upcomingAppointments: { id: string; label: string; date: string }[];
}

function bucketFor(dueMs: number | null, nowMs: number, today: string): Exclude<AgendaBucket, "done"> {
  if (dueMs == null) return "someday";
  if (dueMs <= nowMs) return "overdue";
  const dueDay = new Date(dueMs);
  const dueISO = `${dueDay.getFullYear()}-${String(dueDay.getMonth() + 1).padStart(2, "0")}-${String(dueDay.getDate()).padStart(2, "0")}`;
  const diff = daysBetween(today, dueISO);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

/** Date-only items (expiry, appointments) compare by calendar day, not a
 * clock instant — an item "expiring today" isn't overdue at 2pm. */
function dateBucket(dateISO: string, today: string): Exclude<AgendaBucket, "done" | "someday"> {
  if (dateISO < today) return "overdue";
  const diff = daysBetween(today, dateISO);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

function timing(bucket: AgendaBucket, dueMs: number | null, hasClock: boolean, today: string): string {
  if (dueMs == null) return "";
  const d = new Date(dueMs);
  const clock = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (bucket === "overdue") {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const diff = daysBetween(today, iso);
    if (diff >= 0) return hasClock ? clock : "earlier today";
    if (diff === -1) return "yesterday";
    return `${-diff} days ago`;
  }
  if (bucket === "today" || bucket === "tomorrow") return hasClock ? clock : "";
  if (bucket === "week") {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return hasClock ? `${weekday} · ${clock}` : weekday;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function hasClockTime(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function reminderEntries(tasks: TaskItem[], scope: AgendaScope, nowMs: number, today: string): AgendaEntry[] {
  const out: AgendaEntry[] = [];
  for (const t of tasks) {
    if (t.isArchived) continue;
    const done = isTaskDone(t);
    const recurring = isRecurringTask(t);
    const dueMs = t.dueAt ? new Date(t.dueAt).getTime() : null;
    const bucket: AgendaBucket = done ? "done" : bucketFor(dueMs, nowMs, today);
    const clock = !recurring && t.dueAt ? hasClockTime(t.dueAt) : false;
    out.push({
      key: `reminder:${t.id}`,
      kind: "reminder",
      scope,
      bucket,
      title: t.title,
      subtitle: t.notes ?? undefined,
      dueMs,
      when: done ? "" : timing(bucket, dueMs, clock, today),
      recurring,
      reminder: t,
    });
  }
  return out;
}

function expiryEntries(items: ExpirationItem[], scope: AgendaScope, today: string): AgendaEntry[] {
  return items.map((it) => {
    const bucket = dateBucket(it.expiresOn, today);
    const dueMs = new Date(`${it.expiresOn}T00:00:00`).getTime();
    return {
      key: `expiry:${it.id}`,
      kind: "expiry" as const,
      scope,
      bucket,
      title: it.name,
      subtitle: it.remindDaysBefore > 0 ? `remind ${it.remindDaysBefore}d before` : undefined,
      dueMs,
      when: timing(bucket, dueMs, false, today),
      expiry: it,
    };
  });
}

function followUpEntries(tasks: DoctorFollowUpTask[], today: string): AgendaEntry[] {
  const out: AgendaEntry[] = [];
  for (const t of tasks) {
    if (t.completedAt) continue;
    let bucket: Exclude<AgendaBucket, "done" | "someday"> | "someday" = "someday";
    let dueMs: number | null = null;
    if (t.dueDate) {
      bucket = dateBucket(t.dueDate, today);
      dueMs = new Date(`${t.dueDate}T00:00:00`).getTime();
    } else if (t.reminderAt) {
      dueMs = new Date(t.reminderAt).getTime();
      bucket = bucketFor(dueMs, Date.now(), today);
    }
    out.push({
      key: `followup:${t.id}`,
      kind: "followup",
      scope: "medical",
      bucket,
      title: t.description,
      subtitle: "Follow-up",
      dueMs,
      when: timing(bucket, dueMs, Boolean(t.reminderAt && !t.dueDate), today),
      href: "/medical#followups",
    });
  }
  return out;
}

function appointmentEntries(appts: { id: string; label: string; date: string }[], today: string): AgendaEntry[] {
  const horizon = addDaysToDate(today, 14);
  const out: AgendaEntry[] = [];
  for (const a of appts) {
    if (!a.date || a.date > horizon) continue;
    const bucket = dateBucket(a.date, today);
    const dueMs = new Date(`${a.date}T00:00:00`).getTime();
    out.push({
      key: `appointment:${a.id}`,
      kind: "appointment",
      scope: "medical",
      bucket,
      title: a.label,
      subtitle: "Appointment",
      dueMs,
      when: timing(bucket, dueMs, false, today),
      href: "/medical",
    });
  }
  return out;
}

/**
 * The one urgency-first list for Agenda — reminders (mine + shared), product
 * expiry, uncompleted doctor follow-ups and upcoming appointments, all
 * interleaved by *when they matter* and filed into a bucket (Overdue /
 * Today / Tomorrow / Next 7 days / Later / No date / Done). Sorted
 * soonest-first within each bucket.
 */
export function buildAgenda(sources: AgendaSources, opts: { today: string; now?: Date }): AgendaEntry[] {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const { today } = opts;

  const entries = [
    ...reminderEntries(sources.personalReminders, "mine", nowMs, today),
    ...reminderEntries(sources.sharedReminders, "shared", nowMs, today),
    ...expiryEntries(sources.personalExpiry, "mine", today),
    ...expiryEntries(sources.sharedExpiry, "shared", today),
    ...followUpEntries(sources.followUps, today),
    ...appointmentEntries(sources.upcomingAppointments, today),
  ];

  return entries.sort((a, b) => {
    const ai = AGENDA_BUCKET_ORDER.indexOf(a.bucket);
    const bi = AGENDA_BUCKET_ORDER.indexOf(b.bucket);
    if (ai !== bi) return ai - bi;
    if (a.dueMs != null && b.dueMs != null && a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
    if (a.dueMs == null && b.dueMs != null) return 1;
    if (a.dueMs != null && b.dueMs == null) return -1;
    return a.title.localeCompare(b.title);
  });
}

/** "2 overdue · 1 due today · 4 this week" for the summary strip. */
export function agendaSummary(entries: AgendaEntry[]): { overdue: number; today: number; upcoming: number; done: number } {
  let overdue = 0;
  let today = 0;
  let upcoming = 0;
  let done = 0;
  for (const e of entries) {
    if (e.bucket === "overdue") overdue += 1;
    else if (e.bucket === "today") today += 1;
    else if (e.bucket === "done") done += 1;
    else if (e.bucket === "tomorrow" || e.bucket === "week") upcoming += 1;
  }
  return { overdue, today, upcoming, done };
}
