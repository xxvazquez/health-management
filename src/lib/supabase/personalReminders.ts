import { supabase } from "./client";
import { isRecurringTask, nextRecurringDueAt, type TaskItem } from "@/lib/reminders";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";

export interface PersonalNote {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface NoteRow {
  id: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

function toNote(row: NoteRow): PersonalNote {
  return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  recurrence_days: number | null;
  last_completed_at: string | null;
  is_archived: boolean;
  list_id: string | null;
}

function toTask(row: TaskRow): TaskItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    recurrenceDays: row.recurrence_days,
    lastCompletedAt: row.last_completed_at,
    lastCompletedBy: null,
    assignedTo: null,
    isArchived: row.is_archived,
    listId: row.list_id,
  };
}

export interface PersonalItem {
  id: string;
  name: string;
  expiresOn: string;
  remindDaysBefore: number;
}

interface ItemRow {
  id: string;
  name: string;
  expires_on: string;
  remind_days_before: number;
}

function toItem(row: ItemRow): PersonalItem {
  return { id: row.id, name: row.name, expiresOn: row.expires_on, remindDaysBefore: row.remind_days_before };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

const NOTE_COLUMNS = "id, title, body, created_at, updated_at";
const TASK_COLUMNS = "id, title, notes, due_at, recurrence_days, last_completed_at, is_archived, list_id";
const ITEM_COLUMNS = "id, name, expires_on, remind_days_before";
const LIST_COLUMNS = "id, name, sort_order";

/** A user-owned reminder list ("To Do", "To Buy", "Bathroom", …). Real
 * rows so a list can be empty, renamed, and deleted independently of the
 * tasks in it. */
export interface ReminderList {
  id: string;
  name: string;
  sortOrder: number;
}

interface ListRow {
  id: string;
  name: string;
  sort_order: number;
}

function toList(row: ListRow): ReminderList {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export async function fetchReminderLists(): Promise<ReminderList[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("reminder_lists")
    .select(LIST_COLUMNS)
    .eq("user_id", myUserId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as ListRow[]).map(toList);
}

export async function createReminderList(name: string, sortOrder: number): Promise<ReminderList> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("reminder_lists")
    .insert({ user_id: myUserId, name: name.trim(), sort_order: sortOrder })
    .select(LIST_COLUMNS)
    .single();
  if (error) throw error;
  return toList(data as ListRow);
}

export async function renameReminderList(id: string, name: string): Promise<ReminderList> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase.from("reminder_lists").update({ name: name.trim() }).eq("id", id).select(LIST_COLUMNS).single();
  if (error) throw error;
  return toList(data as ListRow);
}

/** The FK is `on delete set null`, so tasks in a deleted list fall back to
 * the default "Reminders" bucket rather than vanishing. */
export async function deleteReminderList(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("reminder_lists").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPersonalNotes(): Promise<PersonalNote[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from("personal_notes").select(NOTE_COLUMNS).eq("user_id", myUserId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as NoteRow[]).map(toNote);
}

const NOTES_TABLE = "personal_notes";

/** Creates a note, or — offline / mid-outage — queues it and returns the
 * same row immediately; see directWrite.ts. The id is generated here (not
 * by the database) so the local record and the eventual synced row are
 * always the same one. */
export async function createPersonalNote(title: string, body: string): Promise<PersonalNote> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const nowIso = new Date().toISOString();
  const row: NoteRow = { id: createTimeOrderedId(), title: title.trim() || null, body: body.trim(), created_at: nowIso, updated_at: nowIso };
  await upsertDirect(myUserId, NOTES_TABLE, row.id, { ...row, user_id: myUserId });
  return toNote(row);
}

/** Updates a note. Takes the full current entry (not just the id) so an
 * offline save can still upsert a complete row — a bare column patch
 * can't stand in for a row that may not have reached Supabase yet. */
export async function updatePersonalNote(entry: PersonalNote, title: string, body: string): Promise<PersonalNote> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: NoteRow = { id: entry.id, title: title.trim() || null, body: body.trim(), created_at: entry.createdAt, updated_at: new Date().toISOString() };
  await upsertDirect(myUserId, NOTES_TABLE, row.id, { ...row, user_id: myUserId });
  return toNote(row);
}

export async function deletePersonalNote(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, NOTES_TABLE, id);
}

/** Both one-off and recurring tasks, newest-due first (nulls — no
 * deadline — last) — small enough at this scale to fetch in one call and
 * let the UI split it into "Tasks" vs "Recurring" locally. */
export async function fetchPersonalTasks(): Promise<TaskItem[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("personal_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", myUserId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export interface NewPersonalTaskInput {
  title: string;
  notes: string;
  dueAt: string | null;
  recurrenceDays: number | null;
  listId: string | null;
}

export async function createPersonalTask(input: NewPersonalTaskInput): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("personal_tasks")
    .insert({
      user_id: myUserId,
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      due_at: input.dueAt,
      recurrence_days: input.recurrenceDays,
      list_id: input.listId,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

/** Edits a task's own fields (not its completion state). `dueAt`/
 * `recurrenceDays` are recomputed by the caller the same way create does,
 * so switching a task between one-off and recurring just works. */
export async function updatePersonalTask(id: string, input: NewPersonalTaskInput): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("personal_tasks")
    .update({
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      due_at: input.dueAt,
      recurrence_days: input.recurrenceDays,
      list_id: input.listId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function setPersonalTaskArchived(id: string, archived: boolean): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("personal_tasks")
    .update({ is_archived: archived, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

/** Undoes the most recent completion: clears `last_completed_at`, drops
 * the newest personal_task_completions row, and for a recurring task moves
 * `due_at` back to the moment it was completed (so it reads as due again)
 * and re-arms the cron via `reminder_sent_at = null`. Restoring the exact
 * prior `due_at` for a task completed early isn't tracked — edit the date
 * if that matters. */
export async function uncompletePersonalTask(task: TaskItem): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { last_completed_at: null, updated_at: now };
  if (isRecurringTask(task)) {
    update.due_at = task.lastCompletedAt ?? task.dueAt;
    update.reminder_sent_at = null;
  }
  const { data, error } = await supabase.from("personal_tasks").update(update).eq("id", task.id).select(TASK_COLUMNS).single();
  if (error) throw error;
  const { data: latest } = await supabase
    .from("personal_task_completions")
    .select("id")
    .eq("task_id", task.id)
    .order("completed_at", { ascending: false })
    .limit(1);
  const latestId = (latest as { id: string }[] | null)?.[0]?.id;
  if (latestId) await supabase.from("personal_task_completions").delete().eq("id", latestId);
  return toTask(data as TaskRow);
}

export async function deletePersonalTask(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("personal_tasks").delete().eq("id", id);
  if (error) throw error;
}

// --- Expiration (private) -------------------------------------------------
// The owner-only counterpart to household.ts's expiration functions.

export async function fetchPersonalItems(): Promise<PersonalItem[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from("personal_items").select(ITEM_COLUMNS).eq("user_id", myUserId).order("expires_on", { ascending: true });
  if (error) throw error;
  return (data as ItemRow[]).map(toItem);
}

export interface NewPersonalItemInput {
  name: string;
  expiresOn: string;
  remindDaysBefore: number;
}

const ITEMS_TABLE = "personal_items";

/** Creates an expiration item, or — offline / mid-outage — queues it and
 * returns the same row immediately; see directWrite.ts. The id is
 * generated here (not by the database) so the local record and the
 * eventual synced row are always the same one. */
export async function createPersonalItem(input: NewPersonalItemInput): Promise<PersonalItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: ItemRow = { id: createTimeOrderedId(), name: input.name.trim(), expires_on: input.expiresOn, remind_days_before: input.remindDaysBefore };
  await upsertDirect(myUserId, ITEMS_TABLE, row.id, { ...row, user_id: myUserId, reminder_sent_at: null });
  return toItem(row);
}

/** Updates an expiration item. `reminder_sent_at` always resets to null
 * (any edit should let the reminder fire again) — `created_at` is left
 * out of the payload entirely rather than guessed, so an upsert against
 * an existing row never touches it. */
export async function updatePersonalItem(id: string, input: NewPersonalItemInput): Promise<PersonalItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: ItemRow = { id, name: input.name.trim(), expires_on: input.expiresOn, remind_days_before: input.remindDaysBefore };
  await upsertDirect(myUserId, ITEMS_TABLE, id, { ...row, user_id: myUserId, reminder_sent_at: null, updated_at: new Date().toISOString() });
  return toItem(row);
}

export async function deletePersonalItem(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, ITEMS_TABLE, id);
}

/** Marks a task done "for this cycle": a one-off task is simply done; a
 * recurring one advances due_at from right now (see `nextRecurringDueAt`'s
 * own comment on why from-now, not from the previous due_at), clears the
 * cron's reminder_sent_at so the next occurrence can remind again, and gets
 * a row in personal_task_completions recording it — kept alongside the
 * denormalized last_completed_at on the task itself for fast list display. */
export async function completePersonalTask(task: TaskItem): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const now = new Date();
  const update: Record<string, unknown> = { last_completed_at: now.toISOString(), updated_at: now.toISOString() };
  if (isRecurringTask(task)) {
    update.due_at = nextRecurringDueAt(task.recurrenceDays as number, now);
    update.reminder_sent_at = null;
  }
  const { data, error } = await supabase.from("personal_tasks").update(update).eq("id", task.id).select(TASK_COLUMNS).single();
  if (error) throw error;
  const { error: historyError } = await supabase.from("personal_task_completions").insert({ task_id: task.id, user_id: myUserId, completed_at: now.toISOString() });
  if (historyError) throw historyError;
  return toTask(data as TaskRow);
}
