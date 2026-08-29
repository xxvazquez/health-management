"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  completeHouseholdTask,
  createHouseholdCode,
  createHouseholdItem,
  createHouseholdNote,
  createHouseholdTask,
  deleteHouseholdCode,
  deleteHouseholdItem,
  deleteHouseholdNote,
  deleteHouseholdTask,
  fetchHouseholdCodes,
  fetchHouseholdItems,
  fetchHouseholdNotes,
  fetchHouseholdTasks,
  setHouseholdTaskArchived,
  uncompleteHouseholdTask,
  updateHouseholdCode,
  updateHouseholdItem,
  updateHouseholdNote,
  updateHouseholdTask,
  type HouseholdCode,
  type HouseholdNote,
  type NewHouseholdCodeInput,
} from "@/lib/supabase/household";
import {
  buildDemoHouseholdCodes,
  buildDemoHouseholdItems,
  buildDemoHouseholdNotes,
  buildDemoHouseholdTasks,
  DEMO_HOME_ME_ID,
  DEMO_HOME_PARTNER_ID,
} from "@/lib/demoHousehold";
import { getPartnerLink } from "@/lib/supabase/partner";
import { isRecurringTask, nextRecurringDueAt, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { TaskBoard, type TaskFormValues } from "@/components/reminders/TaskBoard";
import { ExpirationBoard } from "@/components/home/ExpirationBoard";
import { CodeBoard } from "@/components/home/CodeBoard";
import { TAB_ICON } from "@/components/tabIcons";

const ACCENT = "var(--series-indigo)";

/** In-memory, per-session cache of the signed-in account's shared boards,
 * so leaving `/home` and coming back doesn't blank to "Loading…" while the
 * refetch runs. Keyed by user id; cleared on sign-out. */
let homeCache: { userId: string; notes: HouseholdNote[]; tasks: TaskItem[]; items: ExpirationItem[]; codes: HouseholdCode[] } | null = null;

type Tab = "notes" | "tasks" | "expiration" | "codes";
const TABS: { id: Tab; label: string; icon: keyof typeof TAB_ICON }[] = [
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "tasks", label: "Reminders", icon: "reminders" },
  { id: "expiration", label: "Expiration", icon: "expiration" },
  { id: "codes", label: "Codes", icon: "codes" },
];

function isHomeTab(v: string): v is Tab {
  return TABS.some((t) => t.id === v);
}

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
  const accountId = session?.user?.id ?? null;
  const myUserId = isDemo ? DEMO_HOME_ME_ID : accountId;

  const [tab, setTab] = useState<Tab>("notes");

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (isHomeTab(id)) setTab(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTab(id: Tab) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  // Survives navigating away and back so returning doesn't re-flash
  // "Loading…" — see usePersonalReminderBoards for the same pattern.
  const seed = homeCache && homeCache.userId === accountId ? homeCache : null;

  const [notes, setNotes] = useState<HouseholdNote[]>(() => seed?.notes ?? buildDemoHouseholdNotes());
  const [notesLoading, setNotesLoading] = useState(seed === null);
  const [notesError, setNotesError] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>(() => seed?.tasks ?? buildDemoHouseholdTasks());
  const [tasksLoading, setTasksLoading] = useState(seed === null);
  const [tasksError, setTasksError] = useState(false);

  const [items, setItems] = useState<ExpirationItem[]>(() => seed?.items ?? buildDemoHouseholdItems());
  const [itemsLoading, setItemsLoading] = useState(seed === null);
  const [itemsError, setItemsError] = useState(false);

  const [codes, setCodes] = useState<HouseholdCode[]>(() => seed?.codes ?? buildDemoHouseholdCodes());
  const [codesLoading, setCodesLoading] = useState(seed === null);
  const [codesError, setCodesError] = useState(false);

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

  // Never set *Loading true here — the initial state already means "loading
  // iff nothing cached", and a background refresh must not blank the screen.
  const loadNotes = useCallback(async () => {
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

  const loadCodes = useCallback(async () => {
    setCodesError(false);
    try {
      setCodes(await fetchHouseholdCodes());
    } catch (err) {
      console.error("fetchHouseholdCodes failed", err);
      setCodesError(true);
    } finally {
      setCodesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemo || !accountId) {
      homeCache = null;
      return;
    }
    if (!notesLoading && !tasksLoading && !itemsLoading && !codesLoading) {
      homeCache = { userId: accountId, notes, tasks, items, codes };
    }
  }, [accountId, isDemo, notes, tasks, items, codes, notesLoading, tasksLoading, itemsLoading, codesLoading]);

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
    void loadCodes();
    // `accountId` so an account switch refetches.
  }, [authLoading, isDemo, accountId, loadNotes, loadTasks, loadItems, loadCodes]);

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

  async function handleCreateTask(values: TaskFormValues) {
    if (isDemo) {
      setTasks((prev) => [
        ...prev,
        {
          id: `demo-${Date.now()}`,
          title: values.title.trim(),
          notes: values.notes.trim() || null,
          dueAt: values.dueAt,
          recurrenceDays: values.recurrenceDays,
          lastCompletedAt: null,
          lastCompletedBy: null,
          assignedTo: values.assignedTo,
          isArchived: false,
          listId: null,
        },
      ]);
      return;
    }
    const created = await createHouseholdTask(values);
    setTasks((prev) => [...prev, created]);
  }

  async function handleEditTask(id: string, values: TaskFormValues) {
    if (isDemo) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, title: values.title.trim(), notes: values.notes.trim() || null, dueAt: values.dueAt, recurrenceDays: values.recurrenceDays, assignedTo: values.assignedTo }
            : t,
        ),
      );
      return;
    }
    const updated = await updateHouseholdTask(id, values);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
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

  async function handleUncompleteTask(task: TaskItem) {
    if (isDemo) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, lastCompletedAt: null, lastCompletedBy: null, dueAt: isRecurringTask(t) ? (t.lastCompletedAt ?? t.dueAt) : t.dueAt }
            : t,
        ),
      );
      return;
    }
    const updated = await uncompleteHouseholdTask(task);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  async function handleArchiveTask(id: string, archived: boolean) {
    if (isDemo) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, isArchived: archived } : t)));
      return;
    }
    const updated = await setHouseholdTaskArchived(id, archived);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
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

  async function handleEditItem(id: string, name: string, expiresOn: string, remindDaysBefore: number) {
    if (isDemo) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: name.trim(), expiresOn, remindDaysBefore } : i)));
      return;
    }
    const updated = await updateHouseholdItem(id, { name, expiresOn, remindDaysBefore });
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  async function handleDeleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (!isDemo) await deleteHouseholdItem(id);
  }

  async function handleCreateCode(input: NewHouseholdCodeInput) {
    if (isDemo) {
      const now = new Date().toISOString();
      setCodes((prev) => [
        {
          id: `demo-${Date.now()}`,
          code: input.code.trim(),
          name: input.name.trim(),
          comment: input.comment.trim() || null,
          expiresOn: input.expiresOn,
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);
      return;
    }
    const created = await createHouseholdCode(input);
    setCodes((prev) => [created, ...prev]);
  }

  async function handleEditCode(id: string, input: NewHouseholdCodeInput) {
    if (isDemo) {
      setCodes((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, code: input.code.trim(), name: input.name.trim(), comment: input.comment.trim() || null, expiresOn: input.expiresOn, updatedAt: new Date().toISOString() }
            : c,
        ),
      );
      return;
    }
    const updated = await updateHouseholdCode(id, input);
    setCodes((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }

  async function handleDeleteCode(id: string) {
    setCodes((prev) => prev.filter((c) => c.id !== id));
    if (!isDemo) await deleteHouseholdCode(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-l-[3px] pl-2.5" style={{ borderColor: ACCENT }}>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Household
        </h1>
        {isDemo && (
          <p className="text-xs" style={{ color: ACCENT }}>
            Example data — nothing here is saved. Sign in to share it with your real partner.
          </p>
        )}
      </div>

      <nav
        className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b"
        style={{ borderColor: `color-mix(in oklab, ${ACCENT} 22%, var(--border-hairline))` }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
              style={{
                color: active ? ACCENT : "var(--text-secondary)",
                fontWeight: active ? 700 : 500,
                borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
                marginBottom: "-1px",
              }}
            >
              {TAB_ICON[t.icon]}
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "notes" && (
        <NoteBoard
          notes={notes}
          loading={!isDemo && notesLoading}
          error={notesError}
          accent={ACCENT}
          emptyDescription="Tap New note to write your first shared note."
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
          emptyTitle="No shared reminders yet"
          emptyDescription="Tap New reminder for a one-off task or a recurring chore — either of you can complete it."
          completedByLabel={completedByLabel}
          onCreate={handleCreateTask}
          onEdit={handleEditTask}
          onComplete={handleCompleteTask}
          onUncomplete={handleUncompleteTask}
          onArchive={handleArchiveTask}
          onDelete={handleDeleteTask}
        />
      )}

      {tab === "expiration" && (
        <ExpirationBoard
          items={items}
          loading={!isDemo && itemsLoading}
          error={itemsError}
          accent={ACCENT}
          onCreate={handleCreateItem}
          onEdit={handleEditItem}
          onDelete={handleDeleteItem}
        />
      )}

      {tab === "codes" && (
        <CodeBoard
          codes={codes}
          loading={!isDemo && codesLoading}
          error={codesError}
          accent={ACCENT}
          onCreate={handleCreateCode}
          onEdit={handleEditCode}
          onDelete={handleDeleteCode}
        />
      )}
    </div>
  );
}
