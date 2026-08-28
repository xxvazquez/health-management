"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completePersonalTask,
  createPersonalItem,
  createPersonalNote,
  createPersonalTask,
  deletePersonalItem,
  deletePersonalNote,
  deletePersonalTask,
  fetchPersonalItems,
  fetchPersonalNotes,
  fetchPersonalTasks,
  setPersonalTaskArchived,
  uncompletePersonalTask,
  updatePersonalItem,
  updatePersonalNote,
  updatePersonalTask,
  type PersonalItem,
  type PersonalNote,
} from "@/lib/supabase/personalReminders";
import { buildDemoPersonalItems, buildDemoPersonalNotes, buildDemoPersonalTasks } from "@/lib/demoPersonalReminders";
import { isRecurringTask, nextRecurringDueAt, type TaskItem } from "@/lib/reminders";
import type { TaskFormValues } from "@/components/reminders/TaskBoard";

/** All the state + handlers behind the Log page's Notes / Reminders /
 * Expiration tabs — the private counterpart to Home's own (inline)
 * household board wiring. Signed out shows interactive example data that
 * lives only in local state (nothing is saved), same stance every other
 * signed-out surface in the app takes. */
export function usePersonalReminderBoards() {
  const { session, loading: authLoading } = useAuth();
  const isDemo = !authLoading && !session;

  const [notes, setNotes] = useState<PersonalNote[]>(() => buildDemoPersonalNotes());
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>(() => buildDemoPersonalTasks());
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(false);

  const [items, setItems] = useState<PersonalItem[]>(() => buildDemoPersonalItems());
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState(false);

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

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(false);
    try {
      setItems(await fetchPersonalItems());
    } catch (err) {
      console.error("fetchPersonalItems failed", err);
      setItemsError(true);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for auth to resolve — otherwise this fires while authLoading is
    // still true (isDemo reads false then too) and overwrites the seeded
    // demo data with an empty fetch. Same guard as the old Personal page.
    if (authLoading || isDemo) return;
    // External read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotes();
    void loadTasks();
    void loadItems();
  }, [authLoading, isDemo, loadNotes, loadTasks, loadItems]);

  // --- Notes ---
  const createNote = useCallback(
    async (title: string, body: string) => {
      if (isDemo) {
        const now = new Date().toISOString();
        setNotes((prev) => [{ id: `demo-${Date.now()}`, title: title.trim() || null, body: body.trim(), createdAt: now, updatedAt: now }, ...prev]);
        return;
      }
      const created = await createPersonalNote(title, body);
      setNotes((prev) => [created, ...prev]);
    },
    [isDemo],
  );

  const updateNote = useCallback(
    async (id: string, title: string, body: string) => {
      if (isDemo) {
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: title.trim() || null, body: body.trim(), updatedAt: new Date().toISOString() } : n)));
        return;
      }
      const updated = await updatePersonalNote(id, title, body);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    },
    [isDemo],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (!isDemo) await deletePersonalNote(id);
    },
    [isDemo],
  );

  // --- Tasks ---
  const createTask = useCallback(
    async (v: TaskFormValues) => {
      if (isDemo) {
        setTasks((prev) => [
          ...prev,
          {
            id: `demo-${Date.now()}`,
            title: v.title.trim(),
            notes: v.notes.trim() || null,
            dueAt: v.dueAt,
            recurrenceDays: v.recurrenceDays,
            lastCompletedAt: null,
            lastCompletedBy: null,
            assignedTo: null,
            isArchived: false,
          },
        ]);
        return;
      }
      const created = await createPersonalTask({ title: v.title, notes: v.notes, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays });
      setTasks((prev) => [...prev, created]);
    },
    [isDemo],
  );

  const editTask = useCallback(
    async (id: string, v: TaskFormValues) => {
      if (isDemo) {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title: v.title.trim(), notes: v.notes.trim() || null, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays } : t)),
        );
        return;
      }
      const updated = await updatePersonalTask(id, { title: v.title, notes: v.notes, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    },
    [isDemo],
  );

  const completeTask = useCallback(
    async (task: TaskItem) => {
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
    },
    [isDemo],
  );

  const uncompleteTask = useCallback(
    async (task: TaskItem) => {
      if (isDemo) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, lastCompletedAt: null, dueAt: isRecurringTask(t) ? (t.lastCompletedAt ?? t.dueAt) : t.dueAt } : t)),
        );
        return;
      }
      const updated = await uncompletePersonalTask(task);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    },
    [isDemo],
  );

  const archiveTask = useCallback(
    async (id: string, archived: boolean) => {
      if (isDemo) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, isArchived: archived } : t)));
        return;
      }
      const updated = await setPersonalTaskArchived(id, archived);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    },
    [isDemo],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (!isDemo) await deletePersonalTask(id);
    },
    [isDemo],
  );

  // --- Expiration ---
  const createItem = useCallback(
    async (name: string, expiresOn: string, remindDaysBefore: number) => {
      if (isDemo) {
        setItems((prev) => [...prev, { id: `demo-${Date.now()}`, name: name.trim(), expiresOn, remindDaysBefore }]);
        return;
      }
      const created = await createPersonalItem({ name, expiresOn, remindDaysBefore });
      setItems((prev) => [...prev, created]);
    },
    [isDemo],
  );

  const editItem = useCallback(
    async (id: string, name: string, expiresOn: string, remindDaysBefore: number) => {
      if (isDemo) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: name.trim(), expiresOn, remindDaysBefore } : i)));
        return;
      }
      const updated = await updatePersonalItem(id, { name, expiresOn, remindDaysBefore });
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    },
    [isDemo],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (!isDemo) await deletePersonalItem(id);
    },
    [isDemo],
  );

  return {
    isDemo,
    notes: { data: notes, loading: notesLoading, error: notesError, create: createNote, update: updateNote, remove: deleteNote },
    tasks: {
      data: tasks,
      loading: tasksLoading,
      error: tasksError,
      create: createTask,
      edit: editTask,
      complete: completeTask,
      uncomplete: uncompleteTask,
      archive: archiveTask,
      remove: deleteTask,
    },
    items: { data: items, loading: itemsLoading, error: itemsError, create: createItem, edit: editItem, remove: deleteItem },
  };
}
