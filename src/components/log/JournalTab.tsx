"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { createJournalEntry, deleteJournalEntry, fetchJournalEntries, updateJournalEntry, type JournalEntry } from "@/lib/supabase/journal";
import { buildDemoJournalEntries } from "@/lib/demoJournal";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useSnapshotCache } from "@/lib/useSnapshotCache";
import { NoteList, NoteRow } from "@/components/ui/Notebook";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { MarkdownContent, MarkdownField, stripMarkdown } from "@/components/ui/Markdown";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { DemoNotice } from "@/components/ui/DemoNotice";

function journalMonthLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function journalRowDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric" });
}

function journalFullDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function matchesSearch(entry: JournalEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (entry.title ?? "").toLowerCase().includes(q) || entry.body.toLowerCase().includes(q);
}

/**
 * Writing sheet for a Journal entry — a per-entry date, a plain title, and
 * a markdown body with a formatting toolbar. Shared between "new entry"
 * (`editing` null) and "edit an existing one".
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
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await onSave({ editing, date, title, body }));
    } catch (err) {
      console.error("journal save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {editing ? "Edit entry" : "New entry"}
        </h3>
        <button type="button" onClick={onCancel} className="min-h-9 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
          Cancel
        </button>
      </div>

      <FormGroup>
        <Field label="Date" inline>
          <DatePicker value={date} onChange={setDate} max={todayLocalISODate()} title="Entry date" ariaLabel="Entry date" />
        </Field>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={150}
          aria-label="Title"
          className="min-h-11 w-full bg-transparent px-3.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-[color:var(--text-muted)]"
          style={{ color: "var(--text-primary)" }}
        />
        <MarkdownField value={body} onChange={setBody} placeholder="Write whatever's on your mind…" autoFocus={!editing} />
      </FormGroup>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" accent={accent} disabled={saving || !body.trim()}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save entry"}
        </Button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>

      {onDelete && (
        <FormGroup>
          {confirmingDelete ? (
            <div className="flex min-h-11 items-center justify-center gap-6 text-sm">
              <button type="button" onClick={onDelete} className="font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete entry
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="font-medium" style={{ color: "var(--ui-accent)" }}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="flex min-h-11 w-full items-center justify-center text-sm font-medium" style={{ color: "var(--status-critical)" }}>
              Delete entry
            </button>
          )}
        </FormGroup>
      )}
    </form>
  );
}

/** Reading view for one entry — the rendered markdown in a white card, with
 * a back link and Edit / Delete in the header. Tapping a row opens this; Edit
 * swaps in the form. */
function JournalEntryView({
  entry,
  onEdit,
  onDelete,
  onBack,
}: {
  entry: JournalEntry;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <button type="button" onClick={onBack} className="min-h-9 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
          ‹ All entries
        </button>
        <div className="flex items-center gap-4 text-sm">
          {confirmingDelete ? (
            <>
              <button type="button" onClick={onDelete} className="min-h-9 font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete entry
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-9 font-medium" style={{ color: "var(--ui-accent)" }}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmingDelete(true)} className="min-h-9 font-medium" style={{ color: "var(--status-critical)" }}>
                Delete
              </button>
              <button type="button" onClick={onEdit} className="min-h-9 font-medium" style={{ color: "var(--ui-accent)" }}>
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {journalFullDate(entry.date)}
          </p>
          {entry.title && (
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {entry.title}
            </h2>
          )}
        </div>
        <MarkdownContent>{entry.body}</MarkdownContent>
      </div>
    </div>
  );
}

const JOURNAL_TABLES = ["journal_entries"] as const;

export function JournalTab({ isDemoData, accent }: { isDemoData: boolean; accent: string }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [entries, setEntries] = useState<JournalEntry[]>(() => (isDemoData ? buildDemoJournalEntries() : []));
  const [loading, setLoading] = useState(() => !isDemoData);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [composing, setComposing] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
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
    return editing ? updateJournalEntry(editing, { date, title, body }) : createJournalEntry({ date, title, body });
  }

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setComposing(false);
    setViewingId(null);
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

  const { persist } = useSnapshotCache<JournalEntry[]>({
    feature: "journal",
    tables: JOURNAL_TABLES,
    userId,
    isDemo: isDemoData,
    seeded: false,
    fetcher: fetchJournalEntries,
    apply: (rows) => {
      setEntries(rows);
      setLoadError(false);
    },
    onSettled: () => setLoading(false),
    onError: () => setLoadError(true),
  });

  useEffect(() => {
    if (!isDemoData && userId && !loading) persist(entries);
  }, [entries, isDemoData, userId, loading, persist]);

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((e) => matchesSearch(e, search));
    const sorted = [...filtered].sort((a, b) => {
      const cmp = a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
      return oldestFirst ? cmp : -cmp;
    });
    return sorted;
  }, [entries, search, oldestFirst]);

  // Group the (already sorted) entries by calendar month so the list reads
  // as a timeline rather than one long undivided stack.
  const monthGroups = useMemo(() => {
    const groups: { label: string; entries: JournalEntry[] }[] = [];
    for (const entry of visibleEntries) {
      const label = journalMonthLabel(entry.date);
      const current = groups[groups.length - 1];
      if (current && current.label === label) current.entries.push(entry);
      else groups.push({ label, entries: [entry] });
    }
    return groups;
  }, [visibleEntries]);

  const editingEntry = editingId ? (entries.find((e) => e.id === editingId) ?? null) : null;
  const viewingEntry = viewingId ? (entries.find((e) => e.id === viewingId) ?? null) : null;

  function handleSaved(entry: JournalEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === entry.id);
      return exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
    });
    setComposing(false);
    setEditingId(null);
    setViewingId(entry.id);
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

  if (viewingEntry) {
    return (
      <JournalEntryView
        entry={viewingEntry}
        onEdit={() => setEditingId(viewingEntry.id)}
        onDelete={() => void handleDelete(viewingEntry.id)}
        onBack={() => setViewingId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isDemoData && <DemoNotice />}
      <div className="flex items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search entries…" className="min-w-0 flex-1 sm:w-64 sm:flex-none" />
        <button
          type="button"
          onClick={() => setOldestFirst((v) => !v)}
          aria-label={oldestFirst ? "Oldest first — tap for newest first" : "Newest first — tap for oldest first"}
          title={oldestFirst ? "Oldest first" : "Newest first"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "var(--field-fill)", color: "var(--text-secondary)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ transform: oldestFirst ? "rotate(180deg)" : undefined }}
          >
            <path d="M6 4v12M3 13l3 3 3-3M14 16V4M11 7l3-3 3 3" />
          </svg>
        </button>
        <div className="sm:ml-auto">
          <PrimaryAction label="New entry" accent={accent} onClick={() => setComposing(true)} />
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ErrorState what="your journal" />
      ) : visibleEntries.length === 0 ? (
        <InlineEmpty
          title={entries.length === 0 ? "No entries yet" : "Nothing matches that search"}
          description={entries.length === 0 ? "Tap New entry to write your first one." : "Try a different search term."}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {monthGroups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <h3 className="px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                {group.label}
              </h3>
              <NoteList>
                {group.entries.map((entry) => (
                  <NoteRow
                    key={entry.id}
                    title={entry.title}
                    meta={journalRowDate(entry.date)}
                    body={stripMarkdown(entry.body)}
                    onOpen={() => setViewingId(entry.id)}
                    onDelete={() => void handleDelete(entry.id)}
                  />
                ))}
              </NoteList>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
