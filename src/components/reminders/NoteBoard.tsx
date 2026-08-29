"use client";

import { useMemo, useState } from "react";
import { NoteList, NoteRow, NotebookForm } from "@/components/ui/Notebook";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";

export interface BoardNote {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function matchesSearch(note: BoardNote, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (note.title ?? "").toLowerCase().includes(q) || note.body.toLowerCase().includes(q);
}

/** A plain title+body note, no deadline — shared between Personal
 * Reminders and Home (they differ only in which table backs the callbacks,
 * not in how a note is edited). Same compact list + editor as Journal. */
export function NoteBoard({
  notes,
  loading,
  error,
  accent,
  onCreate,
  onUpdate,
  onDelete,
  emptyTitle = "No notes yet",
  emptyDescription = "Tap New note to write your first one.",
}: {
  notes: BoardNote[];
  loading: boolean;
  error: boolean;
  accent: string;
  onCreate: (title: string, body: string) => Promise<void>;
  onUpdate: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const visibleNotes = useMemo(() => {
    return notes.filter((n) => matchesSearch(n, search)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, search]);

  const editingNote = editingId ? (notes.find((n) => n.id === editingId) ?? null) : null;

  if (composing || editingNote) {
    return (
      <NotebookForm
        key={editingNote?.id ?? "new"}
        initialTitle={editingNote?.title ?? ""}
        initialBody={editingNote?.body ?? ""}
        accent={accent}
        submitLabel={editingNote ? "Save changes" : "Save note"}
        bodyPlaceholder="Write your note…"
        bodyRows={8}
        autoFocusBody={!editingNote}
        onSubmit={async (title, body) => {
          if (editingNote) await onUpdate(editingNote.id, title, body);
          else await onCreate(title, body);
          setComposing(false);
          setEditingId(null);
        }}
        onCancel={() => {
          setComposing(false);
          setEditingId(null);
        }}
        onDelete={
          editingNote
            ? () => {
                void onDelete(editingNote.id);
                setEditingId(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchField value={search} onChange={setSearch} placeholder="Search notes…" />
        <PrimaryAction label="New note" accent={accent} onClick={() => setComposing(true)} />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load notes — try again in a moment.
        </p>
      ) : visibleNotes.length === 0 ? (
        <InlineEmpty
          title={notes.length === 0 ? emptyTitle : "Nothing matches that search"}
          description={notes.length === 0 ? emptyDescription : "Try a different search term."}
        />
      ) : (
        <NoteList>
          {visibleNotes.map((note) => (
            <NoteRow
              key={note.id}
              title={note.title || "Untitled"}
              meta={formatUpdatedAt(note.updatedAt)}
              body={note.body}
              onOpen={() => setEditingId(note.id)}
              onDelete={() => void onDelete(note.id)}
            />
          ))}
        </NoteList>
      )}
    </div>
  );
}
