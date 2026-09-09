"use client";

import { useState, type ReactNode } from "react";

/** Shared list surface for Journal — `NoteList` / `NoteRow` render the same
 * card row as the rest of the app. The entry editor and reading view live
 * in `JournalTab`. */

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

/** One row in the notes / journal list. The whole row opens the entry (its
 * reading view), so the only trailing action is delete, always with a
 * confirm step. `metaFirst` flips the stack to meta → title → body, which
 * Journal uses so the date leads each row. */
export function NoteRow({
  title,
  meta,
  body,
  metaFirst = false,
  badge,
  onOpen,
  onDelete,
}: {
  title: string | null;
  meta: string;
  body: string;
  metaFirst?: boolean;
  /** A small trailing glyph on the heading line — e.g. a "shared" marker. */
  badge?: ReactNode;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { heading, preview } = headingAndPreview(title, body);

  const titleEl = (
    <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
      <span className="truncate">{heading}</span>
      {badge}
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
