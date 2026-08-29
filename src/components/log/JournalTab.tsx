"use client";

import { useEffect, useMemo, useState } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { createJournalEntry, deleteJournalEntry, fetchJournalEntries, updateJournalEntry, type JournalEntry } from "@/lib/supabase/journal";
import { buildDemoJournalEntries } from "@/lib/demoJournal";
import { NoteList, NoteRow, NotebookForm } from "@/components/ui/Notebook";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";

function formatJournalDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function matchesSearch(entry: JournalEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (entry.title ?? "").toLowerCase().includes(q) || entry.body.toLowerCase().includes(q);
}

/**
 * A blank writing area, not a form with mood/tag pickers — the entire point
 * of Journal (per its own spec) is somewhere that doesn't force a thought
 * into a structured category. Shared between "new entry" and "edit an
 * existing one": `editing` is null for the former, the entry being opened
 * for the latter. Thin wrapper over the shared NotebookForm — it only adds
 * the per-entry date, which the notes boards don't have.
 */
function JournalEntryForm({
  editing,
  defaultDate,
  accent,
  onSave,
  onSaved,
  onDelete,
  onCancel,
}: {
  editing: JournalEntry | null;
  defaultDate: string;
  accent: string;
  onSave: (fields: { editing: JournalEntry | null; date: string; title: string; body: string }) => Promise<JournalEntry>;
  onSaved: (entry: JournalEntry) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(editing?.date ?? defaultDate);

  return (
    <NotebookForm
      initialTitle={editing?.title ?? ""}
      initialBody={editing?.body ?? ""}
      accent={accent}
      submitLabel={editing ? "Save changes" : "Save entry"}
      bodyPlaceholder="Write whatever's on your mind…"
      bodyRows={12}
      autoFocusBody={!editing}
      onDelete={editing ? onDelete : undefined}
      headerSlot={
        <input
          type="date"
          required
          value={date}
          max={todayLocalISODate()}
          onChange={(e) => setDate(e.target.value)}
          className="border-0 bg-transparent p-0 text-xs font-medium outline-none"
          style={{ color: "var(--text-secondary)" }}
        />
      }
      onSubmit={async (title, body) => {
        onSaved(await onSave({ editing, date, title, body }));
      }}
      onCancel={onCancel}
    />
  );
}

export function JournalTab({ isDemoData, accent }: { isDemoData: boolean; accent: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>(() => (isDemoData ? buildDemoJournalEntries() : []));
  const [loading, setLoading] = useState(() => !isDemoData);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reset whenever isDemoData flips (e.g. signing in while example data was
  // showing) — adjusted directly during render, same pattern
  // PushNotificationsToggle uses for its own reset-on-user-change, rather
  // than in the effect below (which would fire an extra post-mount render).
  const [knownIsDemoData, setKnownIsDemoData] = useState(isDemoData);
  if (isDemoData !== knownIsDemoData) {
    setKnownIsDemoData(isDemoData);
    setLoading(!isDemoData);
    setEntries(isDemoData ? buildDemoJournalEntries() : []);
  }

  async function handleSave({ editing, date, title, body }: { editing: JournalEntry | null; date: string; title: string; body: string }): Promise<JournalEntry> {
    if (isDemoData) {
      const nowIso = new Date().toISOString();
      return editing
        ? { ...editing, date, title: title.trim() || null, body: body.trim(), updatedAt: nowIso }
        : { id: `demo-journal-${Date.now()}`, date, title: title.trim() || null, body: body.trim(), createdAt: nowIso, updatedAt: nowIso };
    }
    return editing ? updateJournalEntry(editing.id, { date, title, body }) : createJournalEntry({ date, title, body });
  }

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setComposing(false);
    setEditingId(null);
    if (isDemoData) return;
    try {
      await deleteJournalEntry(id);
    } catch (err) {
      console.error("deleteJournalEntry failed", err);
      // Put it back by re-fetching — the local removal was optimistic.
      fetchJournalEntries()
        .then(setEntries)
        .catch((e) => console.error("fetchJournalEntries failed", e));
    }
  }

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchJournalEntries()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        console.error("fetchJournalEntries failed", err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((e) => matchesSearch(e, search));
    const sorted = [...filtered].sort((a, b) => {
      const cmp = a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
      return oldestFirst ? cmp : -cmp;
    });
    return sorted;
  }, [entries, search, oldestFirst]);

  const editingEntry = editingId ? (entries.find((e) => e.id === editingId) ?? null) : null;

  function handleSaved(entry: JournalEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === entry.id);
      return exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
    });
    setComposing(false);
    setEditingId(null);
  }

  if (composing || editingEntry) {
    return (
      <JournalEntryForm
        key={editingEntry?.id ?? "new"}
        editing={editingEntry}
        defaultDate={todayLocalISODate()}
        accent={accent}
        onSave={handleSave}
        onSaved={handleSaved}
        onDelete={editingEntry ? () => void handleDelete(editingEntry.id) : undefined}
        onCancel={() => {
          setComposing(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isDemoData && (
        <p className="text-xs" style={{ color: accent }}>
          Example journal entries — nothing here is saved. Sign in to keep your own.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="Search entries…" />
          <button
            type="button"
            onClick={() => setOldestFirst((v) => !v)}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
          >
            {oldestFirst ? "Oldest first" : "Newest first"}
          </button>
        </div>
        <button type="button" onClick={() => setComposing(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }}>
          + New entry
        </button>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load your journal — try again in a moment.
        </p>
      ) : visibleEntries.length === 0 ? (
        <InlineEmpty
          title={entries.length === 0 ? "No entries yet" : "Nothing matches that search"}
          description={entries.length === 0 ? "Tap + New entry to write your first one." : "Try a different search term."}
        />
      ) : (
        <NoteList>
          {visibleEntries.map((entry) => (
            <NoteRow
              key={entry.id}
              title={entry.title || "Untitled"}
              meta={formatJournalDate(entry.date)}
              body={entry.body}
              metaFirst
              onOpen={() => setEditingId(entry.id)}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
        </NoteList>
      )}
    </div>
  );
}
