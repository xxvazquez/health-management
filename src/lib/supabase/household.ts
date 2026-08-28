import { supabase, supabaseConfigured } from "./client";
import { isRecurringTask, nextRecurringDueAt, type ExpirationItem, type TaskItem } from "@/lib/reminders";

/** Same "is cloud set up" flag as personalReminders/notes/journal — Home
 * has no offline/local-only mode: both people involved have to be real
 * signed-in accounts on the same cloud project. */
export const householdConfigured = supabaseConfigured;

export interface HouseholdNote {
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

function toNote(row: NoteRow): HouseholdNote {
  return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

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

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

const NOTE_COLUMNS = "id, title, body, created_at, updated_at";
const TASK_COLUMNS = "id, title, notes, due_at, recurrence_days, last_completed_at, last_completed_by, assigned_to, is_archived";
const ITEM_COLUMNS = "id, name, expires_on, remind_days_before";

// --- Notes -------------------------------------------------------------

/** RLS already scopes this to rows owned by either you or your linked
 * partner (see household_notes_select_pair in schema.sql), so no explicit
 * owner filter is needed — unlike personalReminders, where user_id has to
 * be passed to match the "own rows" policy shape. */
export async function fetchHouseholdNotes(): Promise<HouseholdNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("household_notes").select(NOTE_COLUMNS).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as NoteRow[]).map(toNote);
}

export async function createHouseholdNote(title: string, body: string): Promise<HouseholdNote> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("household_notes")
    .insert({ owner_id: myUserId, title: title.trim() || null, body: body.trim() })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw error;
  return toNote(data as NoteRow);
}

export async function updateHouseholdNote(id: string, title: string, body: string): Promise<HouseholdNote> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("household_notes")
    .update({ title: title.trim() || null, body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw error;
  return toNote(data as NoteRow);
}

export async function deleteHouseholdNote(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("household_notes").delete().eq("id", id);
  if (error) throw error;
}

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

export async function createHouseholdTask(input: NewHouseholdTaskInput): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("household_tasks")
    .insert({
      owner_id: myUserId,
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      due_at: input.dueAt,
      recurrence_days: input.recurrenceDays,
      assigned_to: input.assignedTo,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

/** Edits a task's own fields (title/notes/schedule/assignee), not its
 * completion state. Same shape as `updatePersonalTask`. */
export async function updateHouseholdTask(id: string, input: NewHouseholdTaskInput): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("household_tasks")
    .update({
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      due_at: input.dueAt,
      recurrence_days: input.recurrenceDays,
      assigned_to: input.assignedTo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function setHouseholdTaskArchived(id: string, archived: boolean): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("household_tasks")
    .update({ is_archived: archived, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

/** Undoes the most recent completion — see `uncompletePersonalTask` for
 * the full rationale. Also clears `last_completed_by`. */
export async function uncompleteHouseholdTask(task: TaskItem): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { last_completed_at: null, last_completed_by: null, updated_at: now };
  if (isRecurringTask(task)) {
    update.due_at = task.lastCompletedAt ?? task.dueAt;
    update.reminder_sent_at = null;
  }
  const { data, error } = await supabase.from("household_tasks").update(update).eq("id", task.id).select(TASK_COLUMNS).single();
  if (error) throw error;
  const { data: latest } = await supabase
    .from("household_task_completions")
    .select("id")
    .eq("task_id", task.id)
    .order("completed_at", { ascending: false })
    .limit(1);
  const latestId = (latest as { id: string }[] | null)?.[0]?.id;
  if (latestId) await supabase.from("household_task_completions").delete().eq("id", latestId);
  return toTask(data as TaskRow);
}

export async function deleteHouseholdTask(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("household_tasks").delete().eq("id", id);
  if (error) throw error;
}

/** Same "for this cycle" completion logic as `completePersonalTask`, plus
 * `last_completed_by` so the list can show "completed by you / your
 * partner" — either linked partner can complete either side's task (see
 * household_tasks_update_pair), so this isn't necessarily the task's owner. */
export async function completeHouseholdTask(task: TaskItem): Promise<TaskItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const now = new Date();
  const update: Record<string, unknown> = { last_completed_at: now.toISOString(), last_completed_by: myUserId, updated_at: now.toISOString() };
  if (isRecurringTask(task)) {
    update.due_at = nextRecurringDueAt(task.recurrenceDays as number, now);
    update.reminder_sent_at = null;
  }
  const { data, error } = await supabase.from("household_tasks").update(update).eq("id", task.id).select(TASK_COLUMNS).single();
  if (error) throw error;
  const { error: historyError } = await supabase.from("household_task_completions").insert({ task_id: task.id, completed_by: myUserId, completed_at: now.toISOString() });
  if (historyError) throw historyError;
  return toTask(data as TaskRow);
}

export interface HouseholdTaskCompletion {
  id: string;
  completedBy: string;
  completedAt: string;
}

export async function fetchHouseholdTaskCompletionHistory(taskId: string): Promise<HouseholdTaskCompletion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("household_task_completions")
    .select("id, completed_by, completed_at")
    .eq("task_id", taskId)
    .order("completed_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as { id: string; completed_by: string; completed_at: string }[]).map((r) => ({ id: r.id, completedBy: r.completed_by, completedAt: r.completed_at }));
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

export async function createHouseholdItem(input: NewHouseholdItemInput): Promise<ExpirationItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("household_items")
    .insert({ owner_id: myUserId, name: input.name.trim(), expires_on: input.expiresOn, remind_days_before: input.remindDaysBefore })
    .select(ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data as ItemRow);
}

export async function updateHouseholdItem(id: string, input: NewHouseholdItemInput): Promise<ExpirationItem> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("household_items")
    .update({
      name: input.name.trim(),
      expires_on: input.expiresOn,
      remind_days_before: input.remindDaysBefore,
      // Editing the date re-arms the reminder for the new window.
      reminder_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data as ItemRow);
}

export async function deleteHouseholdItem(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("household_items").delete().eq("id", id);
  if (error) throw error;
}
