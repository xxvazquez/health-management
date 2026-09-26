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

function timing(bucket: AgendaBucket, dueMs: number | null, hasClock: boolean, today: string, nowMs: number): string {
  if (dueMs == null) return "";
  const d = new Date(dueMs);
  const clock = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (bucket === "overdue") {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const diff = daysBetween(today, iso);
    if (diff >= 0) {
      if (!hasClock) return "earlier";
      const minsAgo = Math.max(0, Math.round((nowMs - dueMs) / 60000));
      if (minsAgo < 60) return `${minsAgo}m ago`;
      return `${Math.floor(minsAgo / 60)}h ago`;
    }
    if (diff === -1) return "yesterday";
    return `${-diff}d ago`;
  }
  if (bucket === "today" || bucket === "tomorrow") return hasClock ? clock : "";
  if (bucket === "week") {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return hasClock ? `${weekday} ${clock}` : weekday;
  }
  // A date in another year carries it, so next July isn't read as this one.
  const otherYear = String(d.getFullYear()) !== today.slice(0, 4);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: otherYear ? "numeric" : undefined });
}

/** How far off an expiry date is, for the Expiry view's sections. */
export type ExpiryGroup = "expired" | "today" | "thisWeek" | "nextWeek" | "twoWeeks" | "nextMonth" | "sixMonths" | "nextYear" | "later";
export const EXPIRY_GROUP_ORDER: ExpiryGroup[] = ["expired", "today", "thisWeek", "nextWeek", "twoWeeks", "nextMonth", "sixMonths", "nextYear", "later"];
export const EXPIRY_GROUP_LABEL: Record<ExpiryGroup, string> = {
  expired: "Expired",
  today: "Today",
  thisWeek: "This week",
  nextWeek: "Next week",
  twoWeeks: "In two weeks",
  nextMonth: "Next month",
  sixMonths: "In 6 months",
  nextYear: "Next year",
  later: "Later",
};

/** Days from today, in steps: a week, two, three, about two months, half a
 * year, a year, then anything further out. */
export function expiryGroup(expiresOn: string, today: string): ExpiryGroup {
  const days = daysBetween(today, expiresOn);
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days <= 7) return "thisWeek";
  if (days <= 14) return "nextWeek";
  if (days <= 21) return "twoWeeks";
  if (days <= 62) return "nextMonth";
  if (days <= 183) return "sixMonths";
  if (days <= 365) return "nextYear";
  return "later";
}

/** A repeat interval the way Reminders says it: "Daily", "Weekly",
 * "Every 2 weeks", "Every 10 days". */
export function recurrenceLabel(days: number): string {
  if (days === 1) return "Daily";
  if (days === 7) return "Weekly";
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
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
      subtitle: notePreview(t.notes),
      dueMs,
      when: done ? "" : timing(bucket, dueMs, clock, today, nowMs),
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
      subtitle: bucket === "overdue" ? "Expired" : bucket === "today" ? "Expires today" : "Expires",
      dueMs,
      when: timing(bucket, dueMs, false, today, Date.now()),
      expiry: it,
    };
  });
}

function followUpEntries(tasks: DoctorFollowUpTask[], today: string, nowMs: number): AgendaEntry[] {
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
      bucket = bucketFor(dueMs, nowMs, today);
    }
    out.push({
      key: `followup:${t.id}`,
      kind: "followup",
      scope: "medical",
      bucket,
      title: t.description,
      subtitle: "Follow-up",
      dueMs,
      when: timing(bucket, dueMs, Boolean(t.reminderAt && !t.dueDate), today, nowMs),
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
      when: timing(bucket, dueMs, false, today, Date.now()),
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
    ...followUpEntries(sources.followUps, today, nowMs),
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
/** A note as a one-line preview: Markdown list markers dropped, lines
 * joined with " · " rather than running together. */
export function notePreview(notes: string | null | undefined): string | undefined {
  if (!notes) return undefined;
  const lines = notes
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, "").trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join(" · ") : undefined;
}

