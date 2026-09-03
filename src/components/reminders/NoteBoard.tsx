"use client";

import { useMemo, useState, type FormEvent } from "react";
import { NoteList, NoteRow } from "@/components/ui/Notebook";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE } from "@/components/ui/formField";

/** Create-or-edit a note: the same titled-form treatment as the reminder
 * tab next to it (card surface, labelled fields), not Journal's bare
 * writing sheet. Owns its draft + save state; the parent unmounts it on
 * success. */
function NoteForm({
  initialTitle,
  initialBody,
  accent,
  isEdit,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initialTitle: string;
  initialBody: string;
  accent: string;
  isEdit: boolean;
  onSubmit: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(title, body);
    } catch (err) {
      console.error("note save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Edit note" : "New note"}
        </h3>
        <div className="flex items-center gap-3">
          {onDelete &&
            (confirmingDelete ? (
              <>
                <button type="button" onClick={onDelete} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                  Delete
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Delete
              </button>
            ))}
          <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLS} style={LABEL_STYLE}>
          Title <span style={{ color: "var(--text-muted)" }}>· optional</span>
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a name"
          maxLength={150}
          className={`${FIELD_CLS} font-medium`}
          style={FIELD_STYLE}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLS} style={LABEL_STYLE}>
          Note
        </label>
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Write your note…"
          className={`${FIELD_CLS} resize-y leading-relaxed`}
          style={FIELD_STYLE}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Save note"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

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
 * not in how a note is edited). Same card-row list as the rest of the app;
 * the editor is a titled form matching the reminder tab, not Journal's
 * bare writing sheet. */
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
      <NoteForm
        key={editingNote?.id ?? "new"}
        initialTitle={editingNote?.title ?? ""}
        initialBody={editingNote?.body ?? ""}
        accent={accent}
        isEdit={!!editingNote}
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
