"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completePersonalTask,
  createPersonalItem,
  createPersonalNote,
  createPersonalTask,
  createReminderList,
  deletePersonalItem,
  deletePersonalNote,
  deletePersonalTask,
  deleteReminderList,
  fetchPersonalItems,
  fetchPersonalNotes,
  fetchPersonalTasks,
  fetchReminderLists,
  renameReminderList,
  setPersonalTaskArchived,
  uncompletePersonalTask,
  updatePersonalItem,
  updatePersonalNote,
  updatePersonalTask,
  type PersonalItem,
  type PersonalNote,
  type ReminderList,
} from "@/lib/supabase/personalReminders";
import { buildDemoPersonalItems, buildDemoPersonalNotes, buildDemoPersonalTasks, buildDemoReminderLists } from "@/lib/demoPersonalReminders";
import { isRecurringTask, nextRecurringDueAt, type TaskItem } from "@/lib/reminders";
import type { TaskFormValues } from "@/components/reminders/TaskBoard";

/** Survives navigation away from Log and back, so returning doesn't
 * re-flash "Loading…" — the fetch still re-runs in the background to stay
 * fresh, it just doesn't blank what's already on screen. Keyed by user id
 * so an account switch starts clean; cleared on sign-out. */
let cache: { userId: string; notes: PersonalNote[]; tasks: TaskItem[]; items: PersonalItem[]; lists: ReminderList[] } | null = null;

/** All the state + handlers behind the Log page's Notes / Reminders /
 * Expiration tabs — the private counterpart to Home's own (inline)
 * household board wiring. Signed out shows interactive example data that
 * lives only in local state (nothing is saved), same stance every other
 * signed-out surface in the app takes. */
export function usePersonalReminderBoards() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [notes, setNotes] = useState<PersonalNote[]>(() => seed?.notes ?? buildDemoPersonalNotes());
  const [notesLoading, setNotesLoading] = useState(seed === null);
  const [notesError, setNotesError] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>(() => seed?.tasks ?? buildDemoPersonalTasks());
  const [tasksLoading, setTasksLoading] = useState(seed === null);
  const [tasksError, setTasksError] = useState(false);

  const [items, setItems] = useState<PersonalItem[]>(() => seed?.items ?? buildDemoPersonalItems());
  const [itemsLoading, setItemsLoading] = useState(seed === null);
  const [itemsError, setItemsError] = useState(false);

  const [lists, setLists] = useState<ReminderList[]>(() => seed?.lists ?? buildDemoReminderLists());

  // The load* functions never set *Loading true — the initial state already
  // reflects "loading iff nothing cached", and a background refresh must
  // not blank a screen that already has content.
  const loadNotes = useCallback(async () => {
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

  const loadLists = useCallback(async () => {
    try {
      setLists(await fetchReminderLists());
    } catch (err) {
      console.error("fetchReminderLists failed", err);
    }
  }, []);

  // Keep the cross-navigation cache in step with whatever's currently
  // settled on screen (fetches and local edits alike); drop it on sign-out.
  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!notesLoading && !tasksLoading && !itemsLoading) {
      cache = { userId, notes, tasks, items, lists };
    }
  }, [userId, isDemo, notes, tasks, items, lists, notesLoading, tasksLoading, itemsLoading]);

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
    void loadLists();
    // `userId` in the deps so an account switch refetches (isDemo alone
    // stays false across one signed-in user swapping for another).
  }, [authLoading, isDemo, userId, loadNotes, loadTasks, loadItems, loadLists]);

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
      // updatePersonalNote needs the full current row (not just id) so an
      // offline save can still upsert a complete record.
      const existing = notes.find((n) => n.id === id);
      if (!existing) return;
      const updated = await updatePersonalNote(existing, title, body);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    },
    [isDemo, notes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (!isDemo) await deletePersonalNote(id);
    },
    [isDemo],
  );

  // --- Lists ---
  // Alphabetical everywhere they show (tab chips, list pickers) — there's no
  // manual reorder UI, and it keeps Log in step with the Manage page.
  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.name.localeCompare(b.name)), [lists]);

  const createList = useCallback(
    async (name: string): Promise<string> => {
      const trimmed = name.trim();
      if (isDemo) {
        const id = `demo-list-${Date.now()}`;
        setLists((prev) => [...prev, { id, name: trimmed, sortOrder: prev.length }]);
        return id;
      }
      const created = await createReminderList(trimmed, lists.length);
      setLists((prev) => [...prev, created]);
      return created.id;
    },
    [isDemo, lists.length],
  );

  const renameList = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l)));
      if (!isDemo) await renameReminderList(id, trimmed);
    },
    [isDemo],
  );

  const deleteList = useCallback(
    async (id: string) => {
      setLists((prev) => prev.filter((l) => l.id !== id));
      setTasks((prev) => prev.map((t) => (t.listId === id ? { ...t, listId: null } : t)));
      if (!isDemo) await deleteReminderList(id);
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
            listId: v.listId,
          },
        ]);
        return;
      }
      const created = await createPersonalTask({ title: v.title, notes: v.notes, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays, listId: v.listId });
      setTasks((prev) => [...prev, created]);
    },
    [isDemo],
  );

  const editTask = useCallback(
    async (id: string, v: TaskFormValues) => {
      if (isDemo) {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title: v.title.trim(), notes: v.notes.trim() || null, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays, listId: v.listId } : t)),
        );
        return;
      }
      const updated = await updatePersonalTask(id, { title: v.title, notes: v.notes, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays, listId: v.listId });
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
    lists: { data: sortedLists, create: createList, rename: renameList, remove: deleteList },
  };
}
