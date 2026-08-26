"use client";

import { useMemo, useState, type FormEvent } from "react";

export interface BoardNote {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

const PREVIEW_LENGTH = 100;

function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
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
 * not in how a note is edited). Mirrors JournalTab's list/form shape, minus
 * the day-scoping Journal has and this doesn't need. */
function NoteForm({
  editing,
  accent,
  onSave,
  onCancel,
}: {
  editing: BoardNote | null;
  accent: string;
  onSave: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(title, body);
    } catch (err) {
      console.error("note save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={150}
        className="rounded-md border px-3 py-2 text-sm font-medium outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <textarea
        required
        autoFocus={!editing}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Write your note…"
        className="resize-y rounded-md border px-3 py-2.5 text-sm leading-relaxed outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : "Save note"}
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

export function NoteBoard({
  notes,
  loading,
  error,
  accent,
  onCreate,
  onUpdate,
  onDelete,
  emptyTitle = "No notes yet",
  emptyDescription = "Tap + New note to write your first one.",
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
        editing={editingNote}
        accent={accent}
        onSave={async (title, body) => {
          if (editingNote) await onUpdate(editingNote.id, title, body);
          else await onCreate(title, body);
          setComposing(false);
          setEditingId(null);
        }}
        onCancel={() => {
          setComposing(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          className="w-40 rounded-md border py-1.5 px-2.5 text-xs outline-none sm:w-56"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button type="button" onClick={() => setComposing(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }}>
          + New note
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load notes — try again in a moment.
        </p>
      ) : visibleNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--border-hairline)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {notes.length === 0 ? emptyTitle : "Nothing matches that search"}
          </p>
          <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
            {notes.length === 0 ? emptyDescription : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleNotes.map((note) => (
            <div
              key={note.id}
              className="flex w-full items-start gap-3 border-t py-3.5 pr-1 pl-2 first:border-t-0"
              style={{ borderColor: "var(--gridline)" }}
            >
              <button type="button" onClick={() => setEditingId(note.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {note.title || "Untitled"}
                </span>
                <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  {preview(note.body)}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {formatUpdatedAt(note.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void onDelete(note.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium"
                style={{ color: "var(--status-critical)" }}
                aria-label="Delete note"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
