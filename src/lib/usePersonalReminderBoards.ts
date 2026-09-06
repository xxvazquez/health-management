"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completePersonalTask,
  createPersonalItem,
  createPersonalTask,
  createReminderList,
  deletePersonalItem,
  deletePersonalTask,
  deleteReminderList,
  fetchPersonalItems,
  fetchPersonalTasks,
  fetchReminderLists,
  renameReminderList,
  setPersonalTaskArchived,
  uncompletePersonalTask,
  updatePersonalItem,
  updatePersonalTask,
  type PersonalItem,
  type ReminderList,
} from "@/lib/supabase/personalReminders";
import { buildDemoPersonalItems, buildDemoPersonalTasks, buildDemoReminderLists } from "@/lib/demoPersonalReminders";
import { isRecurringTask, nextRecurringDueAt, type TaskItem } from "@/lib/reminders";
import type { TaskFormValues } from "@/components/reminders/TaskBoard";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

const PERSONAL_REMINDER_TABLES = ["personal_tasks", "personal_items", "reminder_lists", "personal_task_completions"] as const;

interface PersonalReminderBundle {
  tasks: TaskItem[];
  items: PersonalItem[];
  lists: ReminderList[];
}

/** Survives navigation away from Log and back, so returning doesn't
 * re-flash "Loading…" — the fetch still re-runs in the background to stay
 * fresh, it just doesn't blank what's already on screen. Keyed by user id
 * so an account switch starts clean; cleared on sign-out. */
let cache: { userId: string; tasks: TaskItem[]; items: PersonalItem[]; lists: ReminderList[] } | null = null;

/** All the state + handlers behind Agenda's personal reminders and
 * product-expiry (the private counterpart to `useHouseholdReminderBoards`).
 * Signed out shows interactive example data that lives only in local state
 * (nothing is saved), same stance every other signed-out surface takes. */
export function usePersonalReminderBoards() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [tasks, setTasks] = useState<TaskItem[]>(() => seed?.tasks ?? buildDemoPersonalTasks());
  const [tasksLoading, setTasksLoading] = useState(seed === null);
  const [tasksError, setTasksError] = useState(false);

  const [items, setItems] = useState<PersonalItem[]>(() => seed?.items ?? buildDemoPersonalItems());
  const [itemsLoading, setItemsLoading] = useState(seed === null);
  const [itemsError, setItemsError] = useState(false);

  const [lists, setLists] = useState<ReminderList[]>(() => seed?.lists ?? buildDemoReminderLists());

  const { persist } = useSnapshotCache<PersonalReminderBundle>({
    feature: "personalReminders",
    tables: PERSONAL_REMINDER_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => {
      const [t, i, l] = await Promise.all([fetchPersonalTasks(), fetchPersonalItems(), fetchReminderLists()]);
      return { tasks: t, items: i, lists: l };
    },
    apply: ({ tasks: t, items: i, lists: l }) => {
      setTasks(t);
      setItems(i);
      setLists(l);
      setTasksError(false);
      setItemsError(false);
    },
    onSettled: () => {
      setTasksLoading(false);
      setItemsLoading(false);
    },
    onError: () => {
      setTasksError(true);
      setItemsError(true);
    },
  });

  // Keep the cross-navigation cache in step with whatever's currently
  // settled on screen (fetches and local edits alike); drop it on sign-out.
  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!tasksLoading && !itemsLoading) {
      cache = { userId, tasks, items, lists };
      persist({ tasks, items, lists });
    }
  }, [userId, isDemo, tasks, items, lists, tasksLoading, itemsLoading, persist]);

  // --- Lists ---
  // Alphabetical everywhere they show (tab chips, list pickers) — there's no
  // manual reorder UI, and it keeps Log in step with the Manage page.
  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.name.localeCompare(b.name)), [lists]);

  const createList = useCallback(
    async (name: string): Promise<string> => {
      const trimmed = name.trim();
      if (isDemo) {
        const id = `demo-list-${Date.now()}`;
        setLists((prev) => [...prev, { id, name: trimmed, sortOrder: prev.length, icon: null, color: null }]);
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
      if (!isDemo) await renameReminderList(id, { name: trimmed });
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
