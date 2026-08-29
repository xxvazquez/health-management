"use client";

import { useEffect, useState } from "react";
import { usePersonalReminderBoards } from "@/lib/usePersonalReminderBoards";
import { JournalTab } from "@/components/log/JournalTab";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { TaskBoard } from "@/components/reminders/TaskBoard";
import { ExpirationBoard } from "@/components/home/ExpirationBoard";
import { TAB_ICON } from "@/components/tabIcons";

const JOURNAL_ACCENT = "var(--series-other)";
const NOTES_ACCENT = "var(--series-magenta)";
const REMINDERS_ACCENT = "var(--series-berry)";
const EXPIRATION_ACCENT = "var(--series-2)";

type PersonalTab = "journal" | "notes" | "reminders" | "expiration";
const TABS: { id: PersonalTab; label: string; accent: string }[] = [
  { id: "journal", label: "Journal", accent: JOURNAL_ACCENT },
  { id: "notes", label: "Notes", accent: NOTES_ACCENT },
  { id: "reminders", label: "Reminders", accent: REMINDERS_ACCENT },
  { id: "expiration", label: "Expiration", accent: EXPIRATION_ACCENT },
];

const BLURB: Record<PersonalTab, string> = {
  journal: "A private diary — a date, an optional title, and whatever's on your mind.",
  notes: "Private notes to yourself — a code, a measurement, a reminder.",
  reminders: "One-off tasks with a deadline, and recurring chores. Organise them into lists on Manage.",
  expiration: "Track when your products and supplements run out.",
};

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
    <div className="flex flex-col gap-5">
      <div className="border-l-[3px] pl-2.5" style={{ borderColor: active.accent }}>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {active.label}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {BLURB[tab]}
        </p>
      </div>

      <nav
        className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b"
        style={{ borderColor: `color-mix(in oklab, ${active.accent} 22%, var(--border-hairline))` }}
      >
        {TABS.map((t) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
              style={{
                color: isActive ? t.accent : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                borderBottom: `2px solid ${isActive ? t.accent : "transparent"}`,
                marginBottom: "-1px",
              }}
            >
              {TAB_ICON[t.id]}
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Journal shows its own "example data" line; the others don't. */}
      {personal.isDemo && tab !== "journal" && (
        <p className="text-xs" style={{ color: active.accent }}>
          Example data — nothing here is saved. Sign in to keep your own.
        </p>
      )}

      {tab === "journal" && <JournalTab isDemoData={personal.isDemo} accent={JOURNAL_ACCENT} />}

      {tab === "notes" && (
        <NoteBoard
          notes={personal.notes.data}
          loading={!personal.isDemo && personal.notes.loading}
          error={personal.notes.error}
          accent={NOTES_ACCENT}
          emptyDescription="Tap + New note to jot something down — a code, a measurement, anything."
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
          emptyDescription="Tap + New for a one-off task with a deadline, or a recurring chore."
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
    </div>
  );
}
