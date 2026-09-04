"use client";

import { useState, type FormEvent, type ReactNode } from "react";

/** Shared surface for the app's writing screens — Log's Journal and the
 * Notes boards (personal + Home). The list (`NoteList` / `NoteRow`) uses
 * the same card row as the rest of the app and is shared by all three.
 * `NotebookForm` is Journal's editor only — an unadorned sheet so writing
 * isn't boxed in; the Notes boards use a titled form (see NoteBoard). */

export function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 16h3l8.6-8.6a1.8 1.8 0 0 0-2.6-2.6L4.4 13.4 4 16Z" />
      <path d="M11.8 5.6 14.4 8.2" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 6h11" />
      <path d="M8 6V4.6h4V6" />
      <path d="M6.2 6 6.9 15a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9L13.8 6" />
      <path d="M9 9v4M11 9v4" />
    </svg>
  );
}

function firstLine(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** The bold line + preview a row shows. With a real title it's title +
 * body start; with no title the body leads — its first line, or the first
 * sentence of a single paragraph — becomes the heading and the rest is the
 * preview (the iOS Notes model), so untitled rows still say something
 * instead of a wall of "Untitled". */
export function headingAndPreview(title: string | null, body: string): { heading: string; preview: string } {
  const trimmedTitle = (title ?? "").trim();
  if (trimmedTitle) return { heading: trimmedTitle, preview: firstLine(body) };

  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { heading: "Untitled", preview: "" };
  if (lines.length > 1) return { heading: firstLine(lines[0], 120), preview: firstLine(lines.slice(1).join(" ")) };

  // One paragraph — break after the first sentence, else at a word boundary.
  const only = lines[0];
  const sentence = only.search(/[.!?]\s/);
  const wordBreak = only.lastIndexOf(" ", 80);
  const cut = sentence > 0 && sentence < 90 ? sentence + 1 : only.length > 80 && wordBreak > 0 ? wordBreak : only.length;
  return { heading: firstLine(only.slice(0, cut), 120), preview: firstLine(only.slice(cut)) };
}

/** One row in the notes / journal list. The whole row opens the entry
 * (there is no separate "expand" — the editor is the reading view, same as
 * iOS Notes), so the only trailing action is delete, always with a confirm
 * step. `metaFirst` flips the stack to meta → title → body, which Journal
 * uses so the date leads each row. */
export function NoteRow({
  title,
  meta,
  body,
  metaFirst = false,
  onOpen,
  onDelete,
}: {
  title: string | null;
  meta: string;
  body: string;
  metaFirst?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { heading, preview } = headingAndPreview(title, body);

  const titleEl = (
    <span className="block truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
      {heading}
    </span>
  );
  const metaEl = (
    <span className="block text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
      {meta}
    </span>
  );

  return (
    <li
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          {metaFirst ? metaEl : titleEl}
          <span className="mt-0.5 block">{metaFirst ? titleEl : metaEl}</span>
          <span className="mt-1.5 line-clamp-2 text-xs leading-snug [overflow-wrap:anywhere]" style={{ color: "var(--text-secondary)" }}>
            {preview || "No additional text"}
          </span>
        </button>

        {onDelete && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${heading}`}
            title="Delete"
            className="tap-target notebook-danger -m-1 shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
            style={{ color: "var(--text-muted)" }}
          >
            <TrashIcon size={15} />
          </button>
        )}
      </div>

      {onDelete && confirmingDelete && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Delete this?</span>
          <button type="button" onClick={onDelete} className="rounded-md px-2 py-1 font-semibold" style={{ color: "var(--status-critical)" }}>
            Delete
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1 font-medium" style={{ color: "var(--text-muted)" }}>
            Keep
          </button>
        </div>
      )}
    </li>
  );
}

/** The list wrapper — a stack of card rows, matching the spacing of the
 * app's other list screens. */
/** `wide` tiles the rows two-up from `xl` — for the flat Notes boards on a
 * wide page. Journal keeps the default single column under its month
 * headers. */
export function NoteList({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <ul className={`flex flex-col gap-3${wide ? " xl:grid xl:grid-cols-2 xl:items-start" : ""}`}>{children}</ul>;
}

/** Create-or-edit editor: a plain sheet, title above body, no field
 * chrome. Owns its own title/body draft and save state; `onSubmit` does
 * the write and the parent unmounts the form on success. */
export function NotebookForm({
  initialTitle = "",
  initialBody = "",
  accent,
  submitLabel,
  headerSlot,
  bodyPlaceholder,
  bodyRows = 12,
  autoFocusBody = false,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initialTitle?: string;
  initialBody?: string;
  accent: string;
  submitLabel: string;
  headerSlot?: ReactNode;
  bodyPlaceholder: string;
  bodyRows?: number;
  autoFocusBody?: boolean;
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
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(title, body);
    } catch (err) {
      console.error("notebook save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {headerSlot}
        </div>
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

      <div className="rounded-xl bg-[var(--surface-1)] px-1 sm:px-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={150}
          className="w-full border-0 bg-transparent p-0 text-lg font-semibold outline-none"
          style={{ color: "var(--text-primary)" }}
        />
        <textarea
          required
          autoFocus={autoFocusBody}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={bodyRows}
          placeholder={bodyPlaceholder}
          className="mt-3 w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : submitLabel}
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
