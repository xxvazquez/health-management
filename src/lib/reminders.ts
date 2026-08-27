import { addDaysToDate, todayLocalISODate } from "@/lib/aggregations/common";

/** Shared shape between Personal Reminders (`personal_tasks`) and Home
 * (`household_tasks`) — one table covers both a one-off deadline and a
 * recurring chore (see schema.sql's own comment on personal_tasks).
 * `lastCompletedBy` is always null for a personal task (there's only ever
 * one possible completer); Home tasks set it to show "who completed it".
 * `assignedTo` is the same story — always null for a personal task, and
 * optional for a Home task (blank means either of you). */
export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  recurrenceDays: number | null;
  lastCompletedAt: string | null;
  lastCompletedBy: string | null;
  assignedTo: string | null;
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

export interface ExpirationItem {
  id: string;
  name: string;
  expiresOn: string; // YYYY-MM-DD
  remindDaysBefore: number;
}

export type ExpirationBucket = "expired" | "soon" | "later";

/** "Expired" once the date has passed; "soon" once within its own
 * remind-before window (so a shorter window means "soon" starts later,
 * closer to the actual date); "later" otherwise. */
export function expirationBucket(item: Pick<ExpirationItem, "expiresOn" | "remindDaysBefore">, today: string = todayLocalISODate()): ExpirationBucket {
  if (item.expiresOn < today) return "expired";
  const remindFrom = addDaysToDate(item.expiresOn, -item.remindDaysBefore);
  return remindFrom <= today ? "soon" : "later";
}

/** Same due/idempotency shape as `isTaskDue` above, for household_items:
 * due once today has reached the remind-before window and it hasn't
 * already been sent. */
export function isExpirationDue(item: Pick<ExpirationItem, "expiresOn" | "remindDaysBefore">, today: string = todayLocalISODate()): boolean {
  return expirationBucket(item, today) !== "later";
}
