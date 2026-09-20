"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { useSwipeReveal, SWIPE_REVEAL_CLASS } from "@/lib/useSwipeReveal";
import { TruncatedTooltip } from "./TruncatedTooltip";

/** Shared list surface for Journal — `NoteList` / `NoteRow` render an iOS
 * grouped list, like the rest of the app. The entry editor and reading view live
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

/** One row in the Journal list — an iOS Notes row: the heading on top, the
 * date and a one-line preview beneath. The whole row opens the entry (its
 * reading view); the only trailing action is delete, always with a confirm
 * step (a swipe reveals it on touch, hover on desktop). Rows sit in a
 * `NoteList` card. */
export function NoteRow({
  title,
  meta,
  body,
  badge,
  onOpen,
  onDelete,
}: {
  title: string | null;
  meta: string;
  body: string;
  /** A small trailing glyph on the heading line — e.g. a "shared" marker. */
  badge?: ReactNode;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { heading, preview } = headingAndPreview(title, body);
  const { revealed, onTouchStart, onTouchEnd } = useSwipeReveal();

  return (
    <li className="group px-3.5 py-2.5" style={{ touchAction: "pan-y" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <TruncatedTooltip text={heading} />
            {badge}
          </span>
          <span className="flex min-w-0 gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
              {meta}
            </span>
            <span className="truncate">{preview || "No additional text"}</span>
          </span>
        </button>

        {onDelete && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${heading}`}
            title="Delete"
            className={clsx(
              "tap-target notebook-danger -m-1 shrink-0 rounded-lg p-1.5 transition-colors hover:bg-[var(--page-plane)]",
              revealed ? SWIPE_REVEAL_CLASS.shown : SWIPE_REVEAL_CLASS.hidden,
            )}
            style={{ color: "var(--text-muted)" }}
          >
            <TrashIcon size={15} />
          </button>
        )}
      </div>

      {onDelete && confirmingDelete && (
        <div className="mt-2 flex items-center gap-4 text-sm">
          <button type="button" onClick={onDelete} className="font-semibold" style={{ color: "var(--status-critical)" }}>
            Delete
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} className="font-medium" style={{ color: "var(--ui-accent)" }}>
            Keep
          </button>
        </div>
      )}
    </li>
  );
}

/** The list wrapper — one white card of rows with inset hairline separators,
 * like an iOS grouped list. */
export function NoteList({ children }: { children: ReactNode }) {
  return (
    <ul className="inset-rows rounded-xl border [--row-inset:0.875rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      {children}
    </ul>
  );
}
