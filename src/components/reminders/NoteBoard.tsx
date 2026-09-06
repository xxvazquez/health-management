"use client";

import { useMemo, useState, type FormEvent } from "react";
import { NoteList, NoteRow } from "@/components/ui/Notebook";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { FIELD_CLS, FIELD_STYLE } from "@/components/ui/formField";

export type NoteScope = "mine" | "shared";

/** The two-person icon marking a note that lives in the shared
 * (`household_notes`) table — visible to a linked partner. */
function SharedGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="8" r="2.4" />
      <circle cx="13" cy="8" r="2.4" />
      <path d="M3.5 16c.4-2.3 1.9-3.6 3.5-3.6 1 0 1.9.5 2.6 1.3" />
      <path d="M10.4 13.7c.7-.8 1.6-1.3 2.6-1.3 1.6 0 3.1 1.3 3.5 3.6" />
    </svg>
  );
}

function Chip({ active, accent, onClick, children }: { active: boolean; accent: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? accent : "var(--border-hairline)",
        background: active ? `color-mix(in oklab, ${accent} 12%, var(--surface-1))` : "transparent",
        color: active ? accent : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

/** Create-or-edit a note: the same titled-form treatment as the reminder
 * tab next to it (card surface, labelled fields), not Journal's bare
 * writing sheet. Owns its draft + save state; the parent unmounts it on
 * success. */
function NoteForm({
  initialTitle,
  initialBody,
  accent,
  isEdit,
  scope,
  canShare,
  onShare,
  onUnshare,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initialTitle: string;
  initialBody: string;
  accent: string;
  isEdit: boolean;
  scope?: NoteScope;
  canShare: boolean;
  onShare?: () => Promise<void>;
  onUnshare?: () => Promise<void>;
  onSubmit: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [movingScope, setMovingScope] = useState(false);

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

  async function handleScopeMove(move: () => Promise<void>) {
    if (movingScope) return;
    setMovingScope(true);
    setError(null);
    try {
      await move();
    } catch (err) {
      console.error("note share change failed", err);
      setError("Couldn't change that — check your connection and try again.");
      setMovingScope(false);
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

      <Field label={<>Title <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a name"
          maxLength={150}
          className={`${FIELD_CLS} font-medium`}
          style={FIELD_STYLE}
        />
      </Field>

      <Field label="Note">
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Write your note…"
          className={`${FIELD_CLS} resize-y leading-relaxed`}
          style={FIELD_STYLE}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" accent={accent} disabled={saving || !body.trim()}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Save note"}
        </Button>
        {isEdit && canShare && scope === "mine" && onShare && (
          <button
            type="button"
            onClick={() => void handleScopeMove(onShare)}
            disabled={movingScope}
            className="inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
            style={{ color: "var(--text-secondary)" }}
          >
            <SharedGlyph />
            {movingScope ? "Sharing…" : "Share with partner"}
          </button>
        )}
        {isEdit && scope === "shared" && onUnshare && (
          <button
            type="button"
            onClick={() => void handleScopeMove(onUnshare)}
            disabled={movingScope}
            className="text-xs font-medium disabled:opacity-50"
            style={{ color: "var(--text-secondary)" }}
          >
            {movingScope ? "Making private…" : "Make private"}
          </button>
        )}
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
  scope?: NoteScope;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function matchesSearch(note: BoardNote, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (note.title ?? "").toLowerCase().includes(q) || note.body.toLowerCase().includes(q);
}

/** A plain title+body note, no deadline. On the Notes area it merges the
 * private (`personal_notes`) and shared (`household_notes`) tables into one
 * list: notes are private by default, "Share with partner" moves a row to
 * the shared table, a two-person glyph marks the shared ones, and a
 * Mine / Shared filter appears once a partner is linked and something is
 * shared. Same card-row list as the rest of the app. */
export function NoteBoard({
  notes,
  loading,
  error,
  accent,
  partnerLinked = false,
  onCreate,
  onUpdate,
  onDelete,
  onShare,
  onUnshare,
  emptyTitle = "No notes yet",
  emptyDescription = "Tap New note to write your first one.",
}: {
  notes: BoardNote[];
  loading: boolean;
  error: boolean;
  accent: string;
  partnerLinked?: boolean;
  onCreate: (title: string, body: string) => Promise<void>;
  onUpdate: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onShare?: (id: string) => Promise<void>;
  onUnshare?: (id: string) => Promise<void>;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | NoteScope>("all");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hasShared = useMemo(() => notes.some((n) => n.scope === "shared"), [notes]);
  const showScopeFilter = partnerLinked && hasShared;

  const visibleNotes = useMemo(() => {
    return notes
      .filter((n) => (showScopeFilter && scopeFilter !== "all" ? n.scope === scopeFilter : true))
      .filter((n) => matchesSearch(n, search))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, search, scopeFilter, showScopeFilter]);

  const editingNote = editingId ? (notes.find((n) => n.id === editingId) ?? null) : null;

  if (composing || editingNote) {
    return (
      <NoteForm
        key={editingNote?.id ?? "new"}
        initialTitle={editingNote?.title ?? ""}
        initialBody={editingNote?.body ?? ""}
        accent={accent}
        isEdit={!!editingNote}
        scope={editingNote?.scope}
        canShare={partnerLinked}
        onShare={editingNote && onShare ? () => onShare(editingNote.id).then(() => setEditingId(null)) : undefined}
        onUnshare={editingNote && onUnshare ? () => onUnshare(editingNote.id).then(() => setEditingId(null)) : undefined}
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

      {showScopeFilter && (
        <div className="flex flex-wrap gap-1.5">
          {(["all", "mine", "shared"] as const).map((s) => (
            <Chip key={s} active={scopeFilter === s} accent={accent} onClick={() => setScopeFilter(s)}>
              {s === "all" ? "All" : s === "mine" ? "Mine" : "Shared"}
            </Chip>
          ))}
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState what="notes" />
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
              title={note.title}
              meta={formatUpdatedAt(note.updatedAt)}
              badge={note.scope === "shared" ? <span title="Shared with your partner" style={{ color: "var(--text-muted)" }}><SharedGlyph /></span> : undefined}
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
