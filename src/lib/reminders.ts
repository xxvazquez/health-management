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
