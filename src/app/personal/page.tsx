"use client";

import { useEffect, useState } from "react";
import { usePersonalReminderBoards } from "@/lib/usePersonalReminderBoards";
import { JournalTab } from "@/components/log/JournalTab";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { BoardPage, type BoardPageTab } from "@/components/ui/BoardPage";
import { DemoNotice } from "@/components/ui/DemoNotice";

const JOURNAL_ACCENT = "var(--series-other)";
const NOTES_ACCENT = "var(--series-magenta)";

type PersonalTab = "journal" | "notes";
const TABS: BoardPageTab[] = [
  { id: "journal", label: "Journal", icon: "journal", accent: JOURNAL_ACCENT },
  { id: "notes", label: "Notes", icon: "notes", accent: NOTES_ACCENT },
];

const TAB_STORAGE_KEY = "lauva-personal-tab";

function isPersonalTab(v: string): v is PersonalTab {
  return TABS.some((t) => t.id === v);
}

/** Your private writing — the diary and plain notes. Reminders and
 * product-expiry moved to Agenda (they're organised by *when*, not by
 * whose list they're on); the shared versions of notes live on the
 * Household page. */
export default function PersonalPage() {
  const personal = usePersonalReminderBoards();
  const [tab, setTab] = useState<PersonalTab>("journal");

  useEffect(() => {
    // External read on mount (URL + localStorage), not a state-sync loop.
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
      title="Notes"
      accent={active.accent}
      tabs={TABS}
      activeTab={active.id}
      onSelectTab={(id) => selectTab(id as PersonalTab)}
      notice={personal.isDemo && tab !== "journal" ? <DemoNotice /> : undefined}
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
    </BoardPage>
  );
}
