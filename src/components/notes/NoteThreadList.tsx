"use client";

import { useState, type ReactNode } from "react";
import { ArchiveIcon, CategoryIcon, EnvelopeClosedIcon, EnvelopeOpenIcon, StarIcon } from "./icons";
import { NOTE_CATEGORY_LABEL, type NoteThread, type NoteView } from "@/lib/supabase/notes";

const ACCENT = "var(--series-magenta)";

export function formatNoteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const VIEW_EMPTY_COPY: Record<NoteView, { title: string; description: string }> = {
  inbox: { title: "Nothing in your inbox", description: "Messages your partner sends you will show up here." },
  sent: { title: "Nothing sent yet", description: "Tap New message to send your partner something." },
  favourites: { title: "No favourites yet", description: "Star a message to keep it easy to find here." },
  archived: { title: "Nothing archived", description: "Messages you archive will show up here." },
};

/** Compact per-row action — same visual language as NoteThreadView's
 * ActionButton, just smaller since it sits inline in the list. */
function RowAction({
  onClick,
  active,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-1)] disabled:opacity-40"
      style={{ color: active ? ACCENT : "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

export function NoteThreadList({
  threads,
  loading,
  error,
  view,
  partnerLabel,
  onOpen,
  onToggleFavourite,
  onToggleArchive,
  onMarkRead,
  onMarkUnread,
  onChanged,
}: {
  threads: NoteThread[];
  loading: boolean;
  error: boolean;
  view: NoteView;
  partnerLabel: string;
  onOpen: (id: string) => void;
  /** Same four actions the open-thread view exposes, so read/unread,
   * favourite and archive work without opening a note first. Injected
   * (not called directly) for the same demo/real split as NoteThreadView. */
  onToggleFavourite: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
  onToggleArchive: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
  onMarkRead: (threadId: string, isMine: boolean) => Promise<void>;
  onMarkUnread: (threadId: string, isMine: boolean) => Promise<void>;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
      onChanged();
    } catch (err) {
      console.error("note row action failed", err);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
        Couldn&apos;t load your notes — try again in a moment.
      </p>
    );
  }

  if (threads.length === 0) {
    const copy = VIEW_EMPTY_COPY[view];
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center"
        style={{ borderColor: "var(--border-hairline)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {copy.title}
        </p>
        <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
          {copy.description}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {threads.map((t) => {
        const busy = busyId === t.id;
        return (
          <div
            key={t.id}
            className="flex items-center gap-1 border-t pr-1 pl-2 transition-colors first:border-t-0 hover:bg-[var(--page-plane)]"
            style={{ borderColor: "var(--gridline)" }}
          >
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex min-w-0 flex-1 items-start gap-3 py-3.5 text-left"
            >
              <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                {t.isUnreadForMe && <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />}
              </span>
              <span className="mt-0.5 shrink-0" style={{ color: ACCENT }}>
                <CategoryIcon category={t.category} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm" style={{ fontWeight: t.isUnreadForMe ? 600 : 500, color: "var(--text-primary)" }}>
                    {t.subject || t.body.slice(0, 60)}
                  </span>
                  {t.isFavouritedByMe && <StarIcon filled size={12} />}
                </span>
                <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {t.isMine ? `To ${partnerLabel}` : `From ${partnerLabel}`} · {NOTE_CATEGORY_LABEL[t.category]}
                </span>
              </span>
            </button>

            <span className="shrink-0 text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-muted)" }}>
              {formatNoteTimestamp(t.lastMessageAt)}
            </span>

            <div className="flex shrink-0 items-center gap-0.5">
              <RowAction
                onClick={() => void run(t.id, () => onToggleFavourite(t.id, t.isMine, !t.isFavouritedByMe))}
                active={t.isFavouritedByMe}
                label={t.isFavouritedByMe ? "Remove favourite" : "Favourite"}
                disabled={busy}
              >
                <StarIcon filled={t.isFavouritedByMe} size={14} />
              </RowAction>
              {t.isUnreadForMe ? (
                <RowAction onClick={() => void run(t.id, () => onMarkRead(t.id, t.isMine))} label="Mark as read" disabled={busy}>
                  <EnvelopeClosedIcon size={14} />
                </RowAction>
              ) : (
                <RowAction onClick={() => void run(t.id, () => onMarkUnread(t.id, t.isMine))} label="Mark as unread" disabled={busy}>
                  <EnvelopeOpenIcon size={14} />
                </RowAction>
              )}
              <RowAction
                onClick={() => void run(t.id, () => onToggleArchive(t.id, t.isMine, !t.isArchivedByMe))}
                active={t.isArchivedByMe}
                label={t.isArchivedByMe ? "Unarchive" : "Archive"}
                disabled={busy}
              >
                <ArchiveIcon size={14} />
              </RowAction>
            </div>
          </div>
        );
      })}
    </div>
  );
}
