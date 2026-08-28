import { addDaysToDate, todayLocalISODate } from "@/lib/aggregations/common";

/** Shared shape between Personal Reminders (`personal_tasks`) and Home
 * (`household_tasks`) — one table covers both a one-off deadline and a
 * recurring chore (see schema.sql's own comment on personal_tasks).
 * `lastCompletedBy` is always null for a personal task (there's only ever
 * one possible completer); Home tasks set it to show "who completed it".
 * `assignedTo` is the same story — always null for a personal task, and
 * optional for a Home task (blank means either of you). `isArchived`
 * retires a task from the active list without deleting its history —
 * mainly for a recurring chore you've stopped. */
export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  recurrenceDays: number | null;
  lastCompletedAt: string | null;
  lastCompletedBy: string | null;
  assignedTo: string | null;
  isArchived: boolean;
  /** Personal reminders only — which `reminder_lists` row this belongs to
   * (null = the default "Reminders" list). Always null for Home tasks. */
  listId: string | null;
}

export function isRecurringTask(task: Pick<TaskItem, "recurrenceDays">): boolean {
  return task.recurrenceDays != null;
}

/** A one-off task is "done" once completed; a recurring task never is —
 * it just waits for its next occurrence. */
export function isTaskDone(task: Pick<TaskItem, "recurrenceDays" | "lastCompletedAt">): boolean {
  return !isRecurringTask(task) && task.lastCompletedAt != null;
}

/** A task is overdue/due once its deadline has passed and it isn't already
 * done — used identically for the UI's "overdue" styling and the cron's
 * due-detection (see the Edge Function's own due-check, which mirrors this
 * but can't import it directly — Deno Edge Functions are deployed as
 * standalone bundles, same reason `isReminderDue` lives inline there too). */
export function isTaskDue(task: Pick<TaskItem, "dueAt" | "recurrenceDays" | "lastCompletedAt">, now: Date = new Date()): boolean {
  if (!task.dueAt) return false;
  if (isTaskDone(task)) return false;
  return new Date(task.dueAt).getTime() <= now.getTime();
}

/** Advances a recurring task's due date from the moment it's completed —
 * not from the previous due_at — so a task completed late doesn't
 * immediately re-show as due again. */
export function nextRecurringDueAt(recurrenceDays: number, completedAt: Date = new Date()): string {
  return new Date(completedAt.getTime() + recurrenceDays * 86_400_000).toISOString();
}

/** Ordering for the active reminders list: overdue first, then due today,
 * then everything else upcoming by soonest due date, then undated tasks
 * alphabetically. A recurring task sorts by its next occurrence (`dueAt`
 * already holds it). Done/archived tasks are grouped separately by the UI
 * and never sorted through here. */
export function compareTasksByDue(a: TaskItem, b: TaskItem, now: Date = new Date()): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTomorrow = startOfToday + 86_400_000;
  const rank = (t: TaskItem): number => {
    if (!t.dueAt) return 3;
    const due = new Date(t.dueAt).getTime();
    if (due < startOfToday) return 0; // overdue
    if (due < startOfTomorrow) return 1; // due today
    return 2; // upcoming
  };
  const byTitle = (x: TaskItem, y: TaskItem) => x.title.localeCompare(y.title, undefined, { sensitivity: "base" });
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return byTitle(a, b);
  return new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime() || byTitle(a, b);
}

export interface ExpirationItem {
  id: string;
  name: string;
  expiresOn: string; // YYYY-MM-DD
  remindDaysBefore: number;
}

export type ExpirationBucket = "expired" | "this_week" | "next_week" | "next_month" | "two_months" | "six_months" | "later";

export const EXPIRATION_BUCKET_LABEL: Record<ExpirationBucket, string> = {
  expired: "Expired",
  this_week: "Expires this week",
  next_week: "Expires next week",
  next_month: "Expires next month",
  two_months: "Expires in two months",
  six_months: "Expires in six months",
  later: "Expires next year or later",
};

/** Fixed section order for the Expiration board — never reordered; empty
 * sections are hidden by the UI, not removed here. */
export const EXPIRATION_BUCKET_ORDER: ExpirationBucket[] = [
  "expired",
  "this_week",
  "next_week",
  "next_month",
  "two_months",
  "six_months",
  "later",
];

/** Sunday that ends the ISO week (Mon–Sun) containing `iso`. */
function endOfIsoWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const mondayIndex = (d.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setUTCDate(d.getUTCDate() + (6 - mondayIndex));
  return d.toISOString().slice(0, 10);
}

/** Last calendar day of the month `monthsAhead` months after `iso`'s month
 * (0 = this month, 1 = next month …). */
function endOfMonthAhead(iso: string, monthsAhead: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthsAhead + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Which section a product falls in — decided purely from `expiresOn`
 * against real calendar periods relative to `today` (this week runs to
 * Sunday; the month buckets run to the last day of the Nth month ahead).
 * The per-item remind-before window is deliberately NOT consulted here —
 * that only drives the notification (see `isExpirationDue`). */
export function expirationBucket(item: Pick<ExpirationItem, "expiresOn">, today: string = todayLocalISODate()): ExpirationBucket {
  const on = item.expiresOn;
  if (on < today) return "expired";
  if (on <= endOfIsoWeek(today)) return "this_week";
  if (on <= addDaysToDate(endOfIsoWeek(today), 7)) return "next_week";
  if (on <= endOfMonthAhead(today, 1)) return "next_month";
  if (on <= endOfMonthAhead(today, 2)) return "two_months";
  if (on <= endOfMonthAhead(today, 6)) return "six_months";
  return "later";
}

/** Same due/idempotency shape as `isTaskDue` above, for household_items:
 * due once today has reached the item's own remind-before window (i.e.
 * expires_on <= today + remind_days_before) — mirrors the cron's
 * `isItemRowDue`. Independent of the display buckets above. */
export function isExpirationDue(item: Pick<ExpirationItem, "expiresOn" | "remindDaysBefore">, today: string = todayLocalISODate()): boolean {
  return item.expiresOn <= addDaysToDate(today, item.remindDaysBefore);
}
