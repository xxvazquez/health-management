import { isExpirationDue, isRecurringTask, isTaskDone, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import type { DoctorFollowUpTask } from "@/lib/supabase/doctors";
import { addDaysToDate, daysBetween, todayLocalISODate } from "@/lib/aggregations/common";

/** How outstanding something is — the sort key, coarser than `group`. */
export type AttentionTier = "overdue" | "today" | "soon";

/** The urgency band a row is filed under in the UI. */
export type AttentionGroup = "overdue" | "today" | "tomorrow" | "week" | "later";

export type AttentionContext = "Reminder" | "Expiry" | "Follow-up" | "Appointment" | "Message";

export interface AttentionItem {
  key: string;
  tier: AttentionTier;
  group: AttentionGroup;
  label: string;
  context: AttentionContext;
  /** In-app route (with hash) for where this is actually handled. */
  href: string;
  /** ms since epoch of the due moment — orders items within a tier
   * (soonest-overdue first, soonest-upcoming first). */
  order: number;
  /** True when `order` carries a meaningful time of day (a one-off
   * reminder set for 6pm); false for date-only items (expiry, appointment)
   * and recurring reminders where the clock time is incidental. */
  hasTime: boolean;
  /** The scannable secondary timing for the row, already relative to the
   * group it sits under: "yesterday" / "3 days ago" under Overdue, a clock
   * time under Today / Tomorrow, a weekday under Next 7 days, "Sep 3" under
   * Later. Empty when there's no moment (unread messages). */
  when: string;
}

/** An item before its group and display timing are filled in — both are
 * derived centrally once every source has been collected. */
type AttentionDraft = Omit<AttentionItem, "when" | "group">;

const TIER_RANK: Record<AttentionTier, number> = { overdue: 0, today: 1, soon: 2 };

/** Dated reminders / follow-ups surface up to a week ahead, so the band
 * covers the next few days rather than only the next 72 hours. Expiry
 * items carry their own `remindDaysBefore` window instead. */
const SOON_DAYS = 7;

/** A scheduled doctor visit is worth surfacing further out than a plain
 * reminder — you often need to prepare or reschedule. */
const APPOINTMENT_SOON_DAYS = 14;

/** The forward-looking "next visit" date for one specialty — passed in by
 * Overview from the Medical (doctors) data, which lives outside DataContext. */
export interface UpcomingAppointment {
  id: string;
  label: string;
  date: string;
}

export interface AttentionSources {
  personalReminders?: TaskItem[];
  householdReminders?: TaskItem[];
  personalExpiry?: ExpirationItem[];
  householdExpiry?: ExpirationItem[];
  followUps?: DoctorFollowUpTask[];
  upcomingAppointments?: UpcomingAppointment[];
  unreadMessages?: number;
}

function localISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hasClockTime(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function tierForMoment(dueMs: number, nowMs: number, todayEndMs: number, soonEndMs: number): AttentionTier | null {
  if (dueMs <= nowMs) return "overdue";
  if (dueMs <= todayEndMs) return "today";
  if (dueMs <= soonEndMs) return "soon";
  return null;
}

function groupFor(draft: AttentionDraft, today: string): AttentionGroup {
  if (draft.tier === "overdue") return "overdue";
  if (!Number.isFinite(draft.order) || draft.order >= Number.MAX_SAFE_INTEGER) return "later";
  const diff = daysBetween(today, localISO(draft.order));
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

function rowTiming(order: number, group: AttentionGroup, hasTime: boolean, today: string): string {
  if (!Number.isFinite(order) || order >= Number.MAX_SAFE_INTEGER) return "";
  const d = new Date(order);
  const clock = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (group === "overdue") {
    const diff = daysBetween(today, localISO(order));
    if (diff >= 0) return "earlier today";
    if (diff === -1) return "yesterday";
    return `${-diff} days ago`;
  }
  if (group === "today" || group === "tomorrow") return hasTime ? clock : "";
  if (group === "week") {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return hasTime ? `${weekday} · ${clock}` : weekday;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function reminderItems(tasks: TaskItem[], href: string, nowMs: number, todayEndMs: number, soonEndMs: number): AttentionDraft[] {
  const out: AttentionDraft[] = [];
  for (const t of tasks) {
    if (t.isArchived || !t.dueAt || isTaskDone(t)) continue;
    const dueMs = new Date(t.dueAt).getTime();
    const tier = tierForMoment(dueMs, nowMs, todayEndMs, soonEndMs);
    if (!tier) continue;
    out.push({
      key: `reminder:${t.id}`,
      tier,
      label: t.title,
      context: "Reminder",
      href,
      order: dueMs,
      hasTime: !isRecurringTask(t) && hasClockTime(t.dueAt),
    });
  }
  return out;
}

function expiryItems(items: ExpirationItem[], href: string, today: string): AttentionDraft[] {
  const out: AttentionDraft[] = [];
  for (const it of items) {
    if (!isExpirationDue(it, today)) continue;
    const tier: AttentionTier = it.expiresOn < today ? "overdue" : it.expiresOn === today ? "today" : "soon";
    out.push({
      key: `expiry:${it.id}`,
      tier,
      label: it.name,
      context: "Expiry",
      href,
      order: new Date(`${it.expiresOn}T00:00:00`).getTime(),
      hasTime: false,
    });
  }
  return out;
}

function followUpItems(tasks: DoctorFollowUpTask[], today: string, nowMs: number, todayEndMs: number, soonEndMs: number): AttentionDraft[] {
  const out: AttentionDraft[] = [];
  for (const t of tasks) {
    if (t.completedAt) continue;
    const reminderFired = t.reminderAt ? new Date(t.reminderAt).getTime() <= nowMs : false;
    let tier: AttentionTier | null = null;
    let order = nowMs;
    let hasTime = false;
    if (t.dueDate) {
      const dueMs = new Date(`${t.dueDate}T00:00:00`).getTime();
      order = dueMs;
      tier = t.dueDate < today ? "overdue" : t.dueDate === today ? "today" : tierForMoment(dueMs, nowMs, todayEndMs, soonEndMs);
    }
    // A fired reminder pulls the task in even when its due date is still
    // far off (or there's no due date at all).
    if (!tier && reminderFired) {
      tier = "soon";
      order = t.reminderAt ? new Date(t.reminderAt).getTime() : nowMs;
      hasTime = Boolean(t.reminderAt);
    }
    if (!tier) continue;
    out.push({ key: `followup:${t.id}`, tier, label: t.description, context: "Follow-up", href: "/medical#followups", order, hasTime });
  }
  return out;
}

function appointmentItems(appts: UpcomingAppointment[], today: string): AttentionDraft[] {
  const horizon = addDaysToDate(today, APPOINTMENT_SOON_DAYS);
  const out: AttentionDraft[] = [];
  for (const a of appts) {
    if (!a.date || a.date < today || a.date > horizon) continue;
    out.push({
      key: `appointment:${a.id}`,
      tier: a.date === today ? "today" : "soon",
      label: a.label,
      context: "Appointment",
      href: "/medical",
      order: new Date(`${a.date}T00:00:00`).getTime(),
      hasTime: false,
    });
  }
  return out;
}

/**
 * The one cross-domain list of everything outstanding — overdue and due
 * reminders (personal + household), product expiry inside its remind
 * window, uncompleted doctor follow-ups (by due date or a fired reminder),
 * upcoming doctor appointments, and unread partner messages. Each item is
 * filed into an urgency `group` (overdue / today / tomorrow / next 7 days /
 * later) and sorted overdue → today → coming up, soonest-first within each.
 */
export function buildAttentionItems(sources: AttentionSources, opts: { today?: string; now?: Date } = {}): AttentionItem[] {
  const today = opts.today ?? todayLocalISODate();
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const todayEndMs = new Date(`${today}T23:59:59.999`).getTime();
  const soonEndMs = new Date(`${addDaysToDate(today, SOON_DAYS)}T23:59:59.999`).getTime();

  const drafts: AttentionDraft[] = [
    ...reminderItems(sources.personalReminders ?? [], "/personal#reminders", nowMs, todayEndMs, soonEndMs),
    ...reminderItems(sources.householdReminders ?? [], "/home#tasks", nowMs, todayEndMs, soonEndMs),
    ...expiryItems(sources.personalExpiry ?? [], "/personal#expiration", today),
    ...expiryItems(sources.householdExpiry ?? [], "/home#expiration", today),
    ...followUpItems(sources.followUps ?? [], today, nowMs, todayEndMs, soonEndMs),
    ...appointmentItems(sources.upcomingAppointments ?? [], today),
  ];

  const unread = sources.unreadMessages ?? 0;
  if (unread > 0) {
    drafts.push({
      key: "messages:unread",
      tier: "soon",
      label: unread === 1 ? "1 unread message" : `${unread} unread messages`,
      context: "Message",
      href: "/notes",
      order: Number.MAX_SAFE_INTEGER,
      hasTime: false,
    });
  }

  return drafts
    .map((d) => {
      const group = groupFor(d, today);
      return { ...d, group, when: rowTiming(d.order, group, d.hasTime, today) };
    })
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order || a.key.localeCompare(b.key));
}

/** "2 overdue · 1 due today · 3 coming up" — for the collapsed band header. */
export function attentionSummary(items: AttentionItem[]): string {
  const counts: Record<AttentionTier, number> = { overdue: 0, today: 0, soon: 0 };
  for (const i of items) counts[i.tier] += 1;
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.today) parts.push(`${counts.today} due today`);
  if (counts.soon) parts.push(`${counts.soon} coming up`);
  return parts.join(" · ");
}
