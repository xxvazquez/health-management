"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completeHouseholdTask,
  createHouseholdItem,
  createHouseholdTask,
  deleteHouseholdItem,
  deleteHouseholdTask,
  fetchHouseholdItems,
  fetchHouseholdTasks,
  setHouseholdTaskArchived,
  uncompleteHouseholdTask,
  updateHouseholdItem,
  updateHouseholdTask,
} from "@/lib/supabase/household";
import { getPartnerLink } from "@/lib/supabase/partner";
import { buildDemoHouseholdItems, buildDemoHouseholdTasks, DEMO_HOME_ME_ID, DEMO_HOME_PARTNER_ID } from "@/lib/demoHousehold";
import { isRecurringTask, nextRecurringDueAt, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import type { TaskFormValues } from "@/components/reminders/TaskBoard";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Survives navigation, keyed by user id — same pattern as
 * `usePersonalReminderBoards` and the old `homeCache`. */
let cache: { userId: string; tasks: TaskItem[]; items: ExpirationItem[] } | null = null;

const HOUSEHOLD_REMINDER_TABLES = ["household_tasks", "household_items", "household_task_completions"] as const;

/**
 * The tasks + expiry slice of the household (`household_*`) boards, in the
 * same shape `usePersonalReminderBoards` returns for the personal side.
 * The Notes / Codes / Wishlist tabs of `/home` keep their own inline
 * wiring — only reminders and expiry moved to Agenda, which is what needs
 * this. Signed out shows interactive demo data (nothing saved).
 */
export function useHouseholdReminderBoards() {
  const { session, loading: authLoading } = useAuth();
  const accountId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const myUserId = isDemo ? DEMO_HOME_ME_ID : accountId;
  const seed = cache && cache.userId === accountId ? cache : null;

  const [tasks, setTasks] = useState<TaskItem[]>(() => seed?.tasks ?? buildDemoHouseholdTasks());
  const [tasksLoading, setTasksLoading] = useState(seed === null);
  const [tasksError, setTasksError] = useState(false);

  const [items, setItems] = useState<ExpirationItem[]>(() => seed?.items ?? buildDemoHouseholdItems());
  const [itemsLoading, setItemsLoading] = useState(seed === null);
  const [itemsError, setItemsError] = useState(false);

  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(null);
  const partnerId = isDemo ? DEMO_HOME_PARTNER_ID : resolvedPartnerId;

  const { persist } = useSnapshotCache<{ tasks: TaskItem[]; items: ExpirationItem[] }>({
    feature: "householdReminders",
    tables: HOUSEHOLD_REMINDER_TABLES,
    userId: accountId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => {
      const [t, i] = await Promise.all([fetchHouseholdTasks(), fetchHouseholdItems()]);
      return { tasks: t, items: i };
    },
    apply: ({ tasks: t, items: i }) => {
      setTasks(t);
      setItems(i);
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

  useEffect(() => {
    if (isDemo || !accountId) return;
    getPartnerLink()
      .then((link) => setResolvedPartnerId(link?.partnerId ?? null))
      .catch((err) => console.error("getPartnerLink failed", err));
  }, [isDemo, accountId]);

  useEffect(() => {
    if (isDemo || !accountId) {
      cache = null;
      return;
    }
    if (!tasksLoading && !itemsLoading) {
      cache = { userId: accountId, tasks, items };
      persist({ tasks, items });
    }
  }, [accountId, isDemo, tasks, items, tasksLoading, itemsLoading, persist]);

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
            assignedTo: v.assignedTo,
            isArchived: false,
            listId: null,
          },
        ]);
        return;
      }
      const created = await createHouseholdTask({ title: v.title, notes: v.notes, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays, assignedTo: v.assignedTo });
      setTasks((prev) => [...prev, created]);
    },
    [isDemo],
  );

  const editTask = useCallback(
    async (id: string, v: TaskFormValues) => {
      if (isDemo) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, title: v.title.trim(), notes: v.notes.trim() || null, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays, assignedTo: v.assignedTo } : t,
          ),
        );
        return;
      }
      const updated = await updateHouseholdTask(id, { title: v.title, notes: v.notes, dueAt: v.dueAt, recurrenceDays: v.recurrenceDays, assignedTo: v.assignedTo });
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
              ? {
                  ...t,
                  lastCompletedAt: now.toISOString(),
                  lastCompletedBy: myUserId,
                  dueAt: isRecurringTask(t) ? nextRecurringDueAt(t.recurrenceDays as number, now) : t.dueAt,
                }
              : t,
          ),
        );
        return;
      }
      const updated = await completeHouseholdTask(task);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    },
    [isDemo, myUserId],
  );

  const uncompleteTask = useCallback(
    async (task: TaskItem) => {
      if (isDemo) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, lastCompletedAt: null, lastCompletedBy: null, dueAt: isRecurringTask(t) ? (t.lastCompletedAt ?? t.dueAt) : t.dueAt } : t,
          ),
        );
        return;
      }
      const updated = await uncompleteHouseholdTask(task);
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
      const updated = await setHouseholdTaskArchived(id, archived);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    },
    [isDemo],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (!isDemo) await deleteHouseholdTask(id);
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
      const created = await createHouseholdItem({ name, expiresOn, remindDaysBefore });
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
      const updated = await updateHouseholdItem(id, { name, expiresOn, remindDaysBefore });
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    },
    [isDemo],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (!isDemo) await deleteHouseholdItem(id);
    },
    [isDemo],
  );

  return {
    isDemo,
    myUserId,
    partnerId,
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
