"use client";

import { useEffect, useState } from "react";
import { usePersonalReminderBoards } from "@/lib/usePersonalReminderBoards";
import { JournalTab } from "@/components/log/JournalTab";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { TaskBoard } from "@/components/reminders/TaskBoard";
import { ExpirationBoard } from "@/components/home/ExpirationBoard";
import { BoardPage, type BoardPageTab } from "@/components/ui/BoardPage";

const JOURNAL_ACCENT = "var(--series-other)";
const NOTES_ACCENT = "var(--series-magenta)";
const REMINDERS_ACCENT = "var(--series-berry)";
const EXPIRATION_ACCENT = "var(--series-2)";

type PersonalTab = "journal" | "notes" | "reminders" | "expiration";
const TABS: BoardPageTab[] = [
  { id: "journal", label: "Journal", icon: "journal", accent: JOURNAL_ACCENT },
  { id: "notes", label: "Notes", icon: "notes", accent: NOTES_ACCENT },
  { id: "reminders", label: "Reminders", icon: "reminders", accent: REMINDERS_ACCENT },
  { id: "expiration", label: "Expiration", icon: "expiration", accent: EXPIRATION_ACCENT },
];

const TAB_STORAGE_KEY = "lauva-personal-tab";

function isPersonalTab(v: string): v is PersonalTab {
  return TABS.some((t) => t.id === v);
}

/** Everything private that you write once and come back to — the diary,
 * plain notes, reminders, and expiry tracking. Split off from the Log page
 * (which is now just the tracking tabs) so "record something that happened"
 * and "manage my own lists" read as different jobs. The *shared* versions
 * of notes/reminders/expiry live on the Shared page. */
export default function PersonalPage() {
  const personal = usePersonalReminderBoards();
  // Starts at "journal" for a match with the statically-rendered HTML, then
  // hydrates from the URL hash (deep links win) or the last-used tab
  // (localStorage) on mount — reading either in the initializer would be a
  // hydration mismatch.
  const [tab, setTab] = useState<PersonalTab>("journal");

  useEffect(() => {
    // External read on mount (URL + localStorage), not a state-sync loop —
    // same shape the rest of the app uses for hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    const hash = window.location.hash.replace("#", "");
    if (isPersonalTab(hash)) {
      setTab(hash);
      return;
    }
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && isPersonalTab(saved)) setTab(saved);
    } catch {
      // Storage blocked — just stay on the default.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (isPersonalTab(id)) setTab(id);
    };
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTab(id: PersonalTab) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {
      // Storage blocked — the tab still switches for this session.
    }
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <BoardPage
      title={active.label}
      accent={active.accent}
      tabs={TABS}
      activeTab={active.id}
      onSelectTab={(id) => selectTab(id as PersonalTab)}
      // Journal shows its own "example data" line; the others don't.
      notice={personal.isDemo && tab !== "journal" ? "Example data — nothing here is saved. Sign in to keep your own." : undefined}
    >
      {tab === "journal" && <JournalTab isDemoData={personal.isDemo} accent={JOURNAL_ACCENT} />}

      {tab === "notes" && (
        <NoteBoard
          notes={personal.notes.data}
          loading={!personal.isDemo && personal.notes.loading}
          error={personal.notes.error}
          accent={NOTES_ACCENT}
          emptyDescription="Tap New note to jot something down — a code, a measurement, anything."
          onCreate={personal.notes.create}
          onUpdate={personal.notes.update}
          onDelete={personal.notes.remove}
        />
      )}

      {tab === "reminders" && (
        <TaskBoard
          tasks={personal.tasks.data}
          loading={!personal.isDemo && personal.tasks.loading}
          error={personal.tasks.error}
          accent={REMINDERS_ACCENT}
          mode="all"
          lists={personal.lists.data}
          onCreateList={personal.lists.create}
          emptyTitle="No reminders yet"
          emptyDescription="Tap New reminder for a one-off task with a deadline, or a recurring chore."
          onCreate={personal.tasks.create}
          onEdit={personal.tasks.edit}
          onComplete={personal.tasks.complete}
          onUncomplete={personal.tasks.uncomplete}
          onArchive={personal.tasks.archive}
          onDelete={personal.tasks.remove}
        />
      )}

      {tab === "expiration" && (
        <ExpirationBoard
          items={personal.items.data}
          loading={!personal.isDemo && personal.items.loading}
          error={personal.items.error}
          accent={EXPIRATION_ACCENT}
          onCreate={personal.items.create}
          onEdit={personal.items.edit}
          onDelete={personal.items.remove}
        />
      )}
    </BoardPage>
  );
}
