import { supabase, supabaseConfigured } from "./client";
import { isRecurringTask, nextRecurringDueAt, type TaskItem } from "@/lib/reminders";

/** Same "is cloud set up" flag as journal/notes — no offline/local-only
 * mode, an entry only exists once it's saved to your account. */
export const personalRemindersConfigured = supabaseConfigured;

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
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

const NOTE_COLUMNS = "id, title, body, created_at, updated_at";
const TASK_COLUMNS = "id, title, notes, due_at, recurrence_days, last_completed_at";

export async function fetchPersonalNotes(): Promise<PersonalNote[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from("personal_notes").select(NOTE_COLUMNS).eq("user_id", myUserId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as NoteRow[]).map(toNote);
}

export async function createPersonalNote(title: string, body: string): Promise<PersonalNote> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("personal_notes")
    .insert({ user_id: myUserId, title: title.trim() || null, body: body.trim() })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw error;
  return toNote(data as NoteRow);
}

export async function updatePersonalNote(id: string, title: string, body: string): Promise<PersonalNote> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { data, error } = await supabase
    .from("personal_notes")
    .update({ title: title.trim() || null, body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw error;
  return toNote(data as NoteRow);
}

export async function deletePersonalNote(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("personal_notes").delete().eq("id", id);
  if (error) throw error;
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
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function deletePersonalTask(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("personal_tasks").delete().eq("id", id);
  if (error) throw error;
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

export interface TaskCompletion {
  id: string;
  completedAt: string;
}

export async function fetchTaskCompletionHistory(taskId: string): Promise<TaskCompletion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("personal_task_completions")
    .select("id, completed_at")
    .eq("task_id", taskId)
    .order("completed_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as { id: string; completed_at: string }[]).map((r) => ({ id: r.id, completedAt: r.completed_at }));
}
