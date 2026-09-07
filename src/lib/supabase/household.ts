import { supabase } from "./client";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { isRecurringTask, nextRecurringDueAt, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, deleteWhereDirect, insertDirect, updateDirect, upsertDirect } from "./directWrite";

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  recurrence_days: number | null;
  last_completed_at: string | null;
  last_completed_by: string | null;
  assigned_to: string | null;
  is_archived: boolean;
}

function toTask(row: TaskRow): TaskItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    recurrenceDays: row.recurrence_days,
    lastCompletedAt: row.last_completed_at,
    lastCompletedBy: row.last_completed_by,
    assignedTo: row.assigned_to,
    isArchived: row.is_archived,
    listId: null, // Home tasks have no lists — that's a personal-reminders feature.
  };
}

interface ItemRow {
  id: string;
  name: string;
  expires_on: string;
  remind_days_before: number;
}

function toItem(row: ItemRow): ExpirationItem {
  return { id: row.id, name: row.name, expiresOn: row.expires_on, remindDaysBefore: row.remind_days_before };
}

export interface HouseholdCode {
  id: string;
  code: string;
  name: string;
  comment: string | null;
  /** ISO date, or null for a code that never expires. */
  expiresOn: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CodeRow {
  id: string;
  code: string;
  name: string;
  comment: string | null;
  expires_on: string | null;
  created_at: string;
  updated_at: string;
}

function toCode(row: CodeRow): HouseholdCode {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    comment: row.comment,
    expiresOn: row.expires_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

const TASK_COLUMNS = "id, title, notes, due_at, recurrence_days, last_completed_at, last_completed_by, assigned_to, is_archived";
const ITEM_COLUMNS = "id, name, expires_on, remind_days_before";
const CODE_COLUMNS = "id, code, name, comment, expires_on, created_at, updated_at";

// Every household_* table is pair-visible (split insert_own / update_pair /
// delete_pair RLS), so a create is an upsert of your own row, an edit goes
// out as a plain update (may be the partner's row), and a delete is a
// delete — all via directWrite so they queue offline. See directWrite.ts.

// --- Tasks ---------------------------------------------------------------

export async function fetchHouseholdTasks(): Promise<TaskItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("household_tasks").select(TASK_COLUMNS).order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export interface NewHouseholdTaskInput {
  title: string;
  notes: string;
  dueAt: string | null;
  recurrenceDays: number | null;
  assignedTo: string | null;
}

function taskPayload(t: TaskItem, ownerId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: t.id,
    owner_id: ownerId,
    title: t.title.trim(),
    notes: t.notes,
    due_at: t.dueAt,
    recurrence_days: t.recurrenceDays,
    last_completed_at: t.lastCompletedAt,
    last_completed_by: t.lastCompletedBy,
    assigned_to: t.assignedTo,
    is_archived: t.isArchived,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

function taskFromInput(id: string, input: NewHouseholdTaskInput, base?: TaskItem): TaskItem {
  return {
    id,
    title: input.title.trim(),
    notes: input.notes.trim() || null,
    dueAt: input.dueAt,
    recurrenceDays: input.recurrenceDays,
    lastCompletedAt: base?.lastCompletedAt ?? null,
    lastCompletedBy: base?.lastCompletedBy ?? null,
    assignedTo: input.assignedTo,
    isArchived: base?.isArchived ?? false,
    listId: null,
  };
}

export async function createHouseholdTask(input: NewHouseholdTaskInput): Promise<TaskItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const t = taskFromInput(createTimeOrderedId(), input);
  await upsertDirect(myUserId, "household_tasks", t.id, taskPayload(t, myUserId));
  return t;
}

/** Edits a task's own fields (title/notes/schedule/assignee), not its
 * completion state. Takes the full current task (may be the partner's). */
export async function updateHouseholdTask(task: TaskItem, input: NewHouseholdTaskInput): Promise<TaskItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next = taskFromInput(task.id, input, task);
  await updateDirect(myUserId, "household_tasks", next.id, taskPayload(next, myUserId));
  return next;
}

export async function setHouseholdTaskArchived(task: TaskItem, archived: boolean): Promise<TaskItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next = { ...task, isArchived: archived };
  await updateDirect(myUserId, "household_tasks", next.id, taskPayload(next, myUserId));
  return next;
}

/** Undoes the most recent completion — see `uncompletePersonalTask` for
 * the full rationale. Also clears `last_completed_by`. */
export async function uncompleteHouseholdTask(task: TaskItem): Promise<TaskItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const recurring = isRecurringTask(task);
  const next: TaskItem = {
    ...task,
    lastCompletedAt: null,
    lastCompletedBy: null,
    dueAt: recurring ? task.lastCompletedAt ?? task.dueAt : task.dueAt,
  };
  await updateDirect(myUserId, "household_tasks", next.id, taskPayload(next, myUserId, recurring ? { reminder_sent_at: null } : undefined));
  if (task.lastCompletedAt) {
    await deleteWhereDirect(myUserId, "household_task_completions", { task_id: task.id, completed_at: task.lastCompletedAt });
  }
  return next;
}

export async function deleteHouseholdTask(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "household_tasks", id);
}

/** Same "for this cycle" completion logic as `completePersonalTask`, plus
 * `last_completed_by` so the list can show "completed by you / your
 * partner" — either linked partner can complete either side's task (see
 * household_tasks_update_pair), so this isn't necessarily the task's owner. */
export async function completeHouseholdTask(task: TaskItem): Promise<TaskItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const nowIso = new Date().toISOString();
  const recurring = isRecurringTask(task);
  const next: TaskItem = {
    ...task,
    lastCompletedAt: nowIso,
    lastCompletedBy: myUserId,
    dueAt: recurring ? nextRecurringDueAt(task.recurrenceDays as number, new Date(nowIso)) : task.dueAt,
  };
  await updateDirect(myUserId, "household_tasks", next.id, taskPayload(next, myUserId, recurring ? { reminder_sent_at: null } : undefined));
  await insertDirect(myUserId, "household_task_completions", { task_id: task.id, completed_at: nowIso }, { id: createTimeOrderedId(), task_id: task.id, completed_by: myUserId, completed_at: nowIso });
  return next;
}

// --- Expiration ------------------------------------------------------------

export async function fetchHouseholdItems(): Promise<ExpirationItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("household_items").select(ITEM_COLUMNS).order("expires_on", { ascending: true });
  if (error) throw error;
  return (data as ItemRow[]).map(toItem);
}

export interface NewHouseholdItemInput {
  name: string;
  expiresOn: string;
  remindDaysBefore: number;
}

function itemPayload(i: ExpirationItem, ownerId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { id: i.id, owner_id: ownerId, name: i.name.trim(), expires_on: i.expiresOn, remind_days_before: i.remindDaysBefore, updated_at: new Date().toISOString(), ...extra };
}

export async function createHouseholdItem(input: NewHouseholdItemInput): Promise<ExpirationItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const i: ExpirationItem = { id: createTimeOrderedId(), name: input.name.trim(), expiresOn: input.expiresOn, remindDaysBefore: input.remindDaysBefore };
  await upsertDirect(myUserId, "household_items", i.id, itemPayload(i, myUserId));
  return i;
}

export async function updateHouseholdItem(id: string, input: NewHouseholdItemInput): Promise<ExpirationItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: ExpirationItem = { id, name: input.name.trim(), expiresOn: input.expiresOn, remindDaysBefore: input.remindDaysBefore };
  // Editing the date re-arms the reminder for the new window.
  await updateDirect(myUserId, "household_items", id, itemPayload(next, myUserId, { reminder_sent_at: null }));
  return next;
}

export async function deleteHouseholdItem(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "household_items", id);
}

// --- Codes ----------------------------------------------------------------

/** Newest first. A code whose `expires_on` has passed is dropped here
 * (fire-and-forget) rather than by a cron: whoever opens the list next
 * cleans it up for both partners. Codes with no expiry date stay forever. */
export async function fetchHouseholdCodes(): Promise<HouseholdCode[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("household_codes").select(CODE_COLUMNS).order("created_at", { ascending: false });
  if (error) throw error;
  const codes = (data as CodeRow[]).map(toCode);
  const today = todayLocalISODate();
  const expiredIds = codes.filter((c) => c.expiresOn !== null && c.expiresOn < today).map((c) => c.id);
  if (expiredIds.length > 0) {
    void supabase
      .from("household_codes")
      .delete()
      .in("id", expiredIds)
      .then(({ error: delError }) => {
        if (delError) console.error("expired household code cleanup failed", delError);
      });
  }
  return codes.filter((c) => c.expiresOn === null || c.expiresOn >= today);
}

export interface NewHouseholdCodeInput {
  code: string;
  name: string;
  comment: string;
  expiresOn: string | null;
}

function codePayload(c: HouseholdCode, ownerId: string): Record<string, unknown> {
  return {
    id: c.id,
    owner_id: ownerId,
    code: c.code.trim(),
    name: c.name.trim(),
    comment: c.comment,
    expires_on: c.expiresOn,
    created_at: c.createdAt,
    updated_at: new Date().toISOString(),
  };
}

export async function createHouseholdCode(input: NewHouseholdCodeInput): Promise<HouseholdCode> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const nowIso = new Date().toISOString();
  const c: HouseholdCode = {
    id: createTimeOrderedId(),
    code: input.code.trim(),
    name: input.name.trim(),
    comment: input.comment.trim() || null,
    expiresOn: input.expiresOn,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await upsertDirect(myUserId, "household_codes", c.id, codePayload(c, myUserId));
  return c;
}

/** Takes the full current code (may be the partner's). */
export async function updateHouseholdCode(code: HouseholdCode, input: NewHouseholdCodeInput): Promise<HouseholdCode> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: HouseholdCode = {
    ...code,
    code: input.code.trim(),
    name: input.name.trim(),
    comment: input.comment.trim() || null,
    expiresOn: input.expiresOn,
    updatedAt: new Date().toISOString(),
  };
  await updateDirect(myUserId, "household_codes", next.id, codePayload(next, myUserId));
  return next;
}

export async function deleteHouseholdCode(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "household_codes", id);
}
