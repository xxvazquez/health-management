"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completeHouseholdTask,
  createHouseholdItem,
  createHouseholdNote,
  createHouseholdTask,
  deleteHouseholdItem,
  deleteHouseholdNote,
  deleteHouseholdTask,
  fetchHouseholdItems,
  fetchHouseholdNotes,
  fetchHouseholdTasks,
  updateHouseholdNote,
  type HouseholdNote,
} from "@/lib/supabase/household";
import { buildDemoHouseholdItems, buildDemoHouseholdNotes, buildDemoHouseholdTasks, DEMO_HOME_ME_ID, DEMO_HOME_PARTNER_ID } from "@/lib/demoHousehold";
import { getPartnerLink } from "@/lib/supabase/partner";
import { isRecurringTask, nextRecurringDueAt, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { TaskBoard } from "@/components/reminders/TaskBoard";
import { ExpirationBoard } from "@/components/home/ExpirationBoard";

const ACCENT = "var(--series-indigo)";

type Tab = "notes" | "tasks" | "expiration";
const TABS: { id: Tab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "tasks", label: "Tasks" },
  { id: "expiration", label: "Expiration" },
];

/** Reminders -> Home: the same notes/tasks concept as Personal, but shared
 * with a linked partner (household_* tables + is_household_member, see
 * schema.sql) instead of owned outright, plus a product-expiration
 * tracker. Works solo too — every household_* row is visible to its
 * creator regardless of whether a partner is linked yet (see
 * is_household_member's own comment), so this never gates on partner_links
 * the way Notes' PartnerLinkPanel does. Signed out shows interactive
 * example data (same reasoning as reminders/page.tsx) — a static sign-in
 * wall couldn't demonstrate the "shared, completed by either of you" idea. */
export default function HomePage() {
  const { session, loading: authLoading } = useAuth();
  const isDemo = !authLoading && !session;
  const myUserId = isDemo ? DEMO_HOME_ME_ID : (session?.user.id ?? null);

  const [tab, setTab] = useState<Tab>("notes");

  const [notes, setNotes] = useState<HouseholdNote[]>(() => buildDemoHouseholdNotes());
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>(() => buildDemoHouseholdTasks());
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(false);

  const [items, setItems] = useState<ExpirationItem[]>(() => buildDemoHouseholdItems());
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState(false);

  // Null until resolved: for a real account from getPartnerLink, or the
  // fixed demo partner id in demo mode (same reasoning as lastCompletedBy's
  // demo data — the "assign to partner" option needs to be visible without a
  // real linked account). Resolved in the effect rather than the initializer
  // because `isDemo` is still false on the first render while auth loads.
  const [partnerId, setPartnerId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (isDemo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPartnerId(DEMO_HOME_PARTNER_ID);
      return;
    }
    getPartnerLink()
      .then((link) => setPartnerId(link?.partnerId ?? null))
      .catch((err) => console.error("getPartnerLink failed", err));
  }, [authLoading, isDemo]);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError(false);
    try {
      setNotes(await fetchHouseholdNotes());
    } catch (err) {
      console.error("fetchHouseholdNotes failed", err);
      setNotesError(true);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(false);
    try {
      setTasks(await fetchHouseholdTasks());
    } catch (err) {
      console.error("fetchHouseholdTasks failed", err);
      setTasksError(true);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(false);
    try {
      setItems(await fetchHouseholdItems());
    } catch (err) {
      console.error("fetchHouseholdItems failed", err);
      setItemsError(true);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for auth to resolve first — see reminders/page.tsx's identical
    // effect for why isDemo alone isn't enough here.
    if (authLoading || isDemo) return;
    // Loading from Supabase on mount — an external-system read, not a
    // React-state sync loop, same reasoning as notes/page.tsx's loadThreads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotes();
    void loadTasks();
    void loadItems();
  }, [authLoading, isDemo, loadNotes, loadTasks, loadItems]);

  // Never the partner's email in UI copy — same privacy stance Notes takes
  // (see notes/page.tsx's PARTNER_LABEL) — just "you" vs "your partner"
  // resolved from the raw user id, which is all last_completed_by needs.
  const completedByLabel = useCallback((userId: string) => (userId === myUserId ? "you" : "your partner"), [myUserId]);

  async function handleCreateNote(title: string, body: string) {
    if (isDemo) {
      const now = new Date().toISOString();
      setNotes((prev) => [{ id: `demo-${Date.now()}`, title: title.trim() || null, body: body.trim(), createdAt: now, updatedAt: now }, ...prev]);
      return;
    }
    const created = await createHouseholdNote(title, body);
    setNotes((prev) => [created, ...prev]);
  }

  async function handleUpdateNote(id: string, title: string, body: string) {
    if (isDemo) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: title.trim() || null, body: body.trim(), updatedAt: new Date().toISOString() } : n)));
      return;
    }
    const updated = await updateHouseholdNote(id, title, body);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }

  async function handleDeleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (!isDemo) await deleteHouseholdNote(id);
  }

  async function handleCreateTask(title: string, notes: string, dueAt: string | null, recurrenceDays: number | null, assignedTo: string | null) {
    if (isDemo) {
      setTasks((prev) => [
        ...prev,
        { id: `demo-${Date.now()}`, title: title.trim(), notes: notes.trim() || null, dueAt, recurrenceDays, lastCompletedAt: null, lastCompletedBy: null, assignedTo },
      ]);
      return;
    }
    const created = await createHouseholdTask({ title, notes, dueAt, recurrenceDays, assignedTo });
    setTasks((prev) => [...prev, created]);
  }

  async function handleCompleteTask(task: TaskItem) {
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
  }

  async function handleDeleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (!isDemo) await deleteHouseholdTask(id);
  }

  async function handleCreateItem(name: string, expiresOn: string, remindDaysBefore: number) {
    if (isDemo) {
      setItems((prev) => [...prev, { id: `demo-${Date.now()}`, name: name.trim(), expiresOn, remindDaysBefore }]);
      return;
    }
    const created = await createHouseholdItem({ name, expiresOn, remindDaysBefore });
    setItems((prev) => [...prev, created]);
  }

  async function handleDeleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (!isDemo) await deleteHouseholdItem(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Home
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Shared notes, tasks, and product expiration — visible to you and your linked partner.
        </p>
        {isDemo && (
          <p className="mt-2 text-xs" style={{ color: ACCENT }}>
            Example data — try adding or completing something below. None of this is saved anywhere; sign in to share it with your
            real partner instead.
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
        <NoteBoard
          notes={notes}
          loading={!isDemo && notesLoading}
          error={notesError}
          accent={ACCENT}
          emptyDescription="Tap + New note to write your first shared note."
          onCreate={handleCreateNote}
          onUpdate={handleUpdateNote}
          onDelete={handleDeleteNote}
        />
      )}

      {tab === "tasks" && (
        <TaskBoard
          tasks={tasks}
          loading={!isDemo && tasksLoading}
          error={tasksError}
          accent={ACCENT}
          mode="all"
          assignable={myUserId ? { myUserId, partnerId } : undefined}
          emptyTitle="No shared tasks yet"
          emptyDescription="Tap + New for a one-off task or a recurring chore — either of you can complete it."
          completedByLabel={completedByLabel}
          onCreate={handleCreateTask}
          onComplete={handleCompleteTask}
          onDelete={handleDeleteTask}
        />
      )}

      {tab === "expiration" && (
        <ExpirationBoard items={items} loading={!isDemo && itemsLoading} error={itemsError} accent={ACCENT} onCreate={handleCreateItem} onDelete={handleDeleteItem} />
      )}
    </div>
  );
}
