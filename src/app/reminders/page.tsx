"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completePersonalTask,
  createPersonalNote,
  createPersonalTask,
  deletePersonalNote,
  deletePersonalTask,
  fetchPersonalNotes,
  fetchPersonalTasks,
  updatePersonalNote,
  type PersonalNote,
} from "@/lib/supabase/personalReminders";
import { buildDemoPersonalNotes, buildDemoPersonalTasks } from "@/lib/demoPersonalReminders";
import { isRecurringTask, nextRecurringDueAt, type TaskItem } from "@/lib/reminders";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { TaskBoard } from "@/components/reminders/TaskBoard";

const ACCENT = "var(--series-6)";

type Tab = "notes" | "tasks" | "recurring";
const TABS: { id: Tab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "tasks", label: "Tasks" },
  { id: "recurring", label: "Recurring" },
];

/** Reminders -> Personal: private notes/tasks/recurring chores, deliberately
 * separate from Home (shared with a partner) — same "own tables, own RLS"
 * split as Log's personal logging vs. Notes' partner messaging. Signed out
 * shows the same interactive example-data preview Notes uses (demoNotes.ts's
 * demoSend/demoReply pattern) rather than a bare sign-in wall — a static
 * wall can't demonstrate what this page actually does. */
export default function RemindersPage() {
  const { session, loading: authLoading } = useAuth();
  const isDemo = !authLoading && !session;

  const [tab, setTab] = useState<Tab>("notes");

  const [notes, setNotes] = useState<PersonalNote[]>(() => buildDemoPersonalNotes());
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>(() => buildDemoPersonalTasks());
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(false);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError(false);
    try {
      setNotes(await fetchPersonalNotes());
    } catch (err) {
      console.error("fetchPersonalNotes failed", err);
      setNotesError(true);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(false);
    try {
      setTasks(await fetchPersonalTasks());
    } catch (err) {
      console.error("fetchPersonalTasks failed", err);
      setTasksError(true);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for auth to resolve first — otherwise this fires once while
    // `authLoading` is still true (isDemo reads false in that instant too,
    // since it's defined as `!authLoading && !session`), fetching an empty
    // result that overwrites the seeded demo data before we even know
    // whether we're actually signed out.
    if (authLoading || isDemo) return;
    // Loading from Supabase on mount — an external-system read, not a
    // React-state sync loop, same reasoning as notes/page.tsx's loadThreads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotes();
    void loadTasks();
  }, [authLoading, isDemo, loadNotes, loadTasks]);

  async function handleCreateNote(title: string, body: string) {
    if (isDemo) {
      const now = new Date().toISOString();
      setNotes((prev) => [{ id: `demo-${Date.now()}`, title: title.trim() || null, body: body.trim(), createdAt: now, updatedAt: now }, ...prev]);
      return;
    }
    const created = await createPersonalNote(title, body);
    setNotes((prev) => [created, ...prev]);
  }

  async function handleUpdateNote(id: string, title: string, body: string) {
    if (isDemo) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: title.trim() || null, body: body.trim(), updatedAt: new Date().toISOString() } : n)));
      return;
    }
    const updated = await updatePersonalNote(id, title, body);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }

  async function handleDeleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (!isDemo) await deletePersonalNote(id);
  }

  async function handleCreateTask(title: string, notes: string, dueAt: string | null, recurrenceDays: number | null) {
    if (isDemo) {
      setTasks((prev) => [
        ...prev,
        { id: `demo-${Date.now()}`, title: title.trim(), notes: notes.trim() || null, dueAt, recurrenceDays, lastCompletedAt: null, lastCompletedBy: null, assignedTo: null },
      ]);
      return;
    }
    const created = await createPersonalTask({ title, notes, dueAt, recurrenceDays });
    setTasks((prev) => [...prev, created]);
  }

  async function handleCompleteTask(task: TaskItem) {
    if (isDemo) {
      const now = new Date();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, lastCompletedAt: now.toISOString(), dueAt: isRecurringTask(t) ? nextRecurringDueAt(t.recurrenceDays as number, now) : t.dueAt }
            : t,
        ),
      );
      return;
    }
    const updated = await completePersonalTask(task);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  async function handleDeleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (!isDemo) await deletePersonalTask(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Personal Reminders
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Notes, tasks, and recurring chores — private to you.
        </p>
        {isDemo && (
          <p className="mt-2 text-xs" style={{ color: ACCENT }}>
            Example data — try adding or completing something below. None of this is saved anywhere; sign in to keep it for real.
          </p>
        )}
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--gridline)" }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              style={{ borderColor: active ? ACCENT : "transparent", color: active ? ACCENT : "var(--text-secondary)" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "notes" && (
        <NoteBoard notes={notes} loading={!isDemo && notesLoading} error={notesError} accent={ACCENT} onCreate={handleCreateNote} onUpdate={handleUpdateNote} onDelete={handleDeleteNote} />
      )}

      {tab === "tasks" && (
        <TaskBoard
          tasks={tasks}
          loading={!isDemo && tasksLoading}
          error={tasksError}
          accent={ACCENT}
          mode="one-off"
          emptyTitle="No tasks yet"
          emptyDescription="Tap + New to add a task with an optional deadline."
          onCreate={handleCreateTask}
          onComplete={handleCompleteTask}
          onDelete={handleDeleteTask}
        />
      )}

      {tab === "recurring" && (
        <TaskBoard
          tasks={tasks}
          loading={!isDemo && tasksLoading}
          error={tasksError}
          accent={ACCENT}
          mode="recurring"
          emptyTitle="No recurring tasks yet"
          emptyDescription="Tap + New for chores like cleaning or changing filters — mark done each time and it schedules the next one."
          onCreate={handleCreateTask}
          onComplete={handleCompleteTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
