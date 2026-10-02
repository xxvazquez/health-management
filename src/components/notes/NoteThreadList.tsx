"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { SWIPE_REVEAL_CLASS, useSwipeReveal } from "@/lib/useSwipeReveal";
import { EyeIcon, EyeOffIcon, StarIcon } from "./icons";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { NOTE_CATEGORY_LABEL, type NoteThread, type NoteView } from "@/lib/supabase/notes";

const ACCENT = "var(--series-magenta)";

export function formatNoteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Compact, context-relative stamp for the inbox rows, where width is
 * tight: today → time, this week → weekday, this year → day + month,
 * older → short numeric date. The full form above still backs the thread
 * view. */
export function formatNoteTimestampShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (daysAgo <= 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const VIEW_EMPTY_COPY: Record<NoteView, { title: string; description: string }> = {
  inbox: { title: "Nothing in your inbox", description: "Messages your partner sends you will show up here." },
  sent: { title: "Nothing sent yet", description: "Tap New message to send your partner something." },
  favourites: { title: "No favourites yet", description: "Star a message to keep it easy to find here." },
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
      className="tap-target shrink-0 rounded-lg p-1.5 transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40"
      style={{ color: active ? ACCENT : "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

/** One thread in a folder. Favourite and read/unread sit behind a left
 * swipe on a phone and appear on hover from `lg`, like Mail's row actions;
 * a small star by the time marks a favourite without opening them. */
function ThreadRow({
  thread: t,
  view,
  partnerLabel,
  busy,
  onOpen,
  onToggleFavourite,
  onMarkRead,
  onMarkUnread,
}: {
  thread: NoteThread;
  view: NoteView;
  partnerLabel: string;
  busy: boolean;
  onOpen: (id: string) => void;
  onToggleFavourite: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}) {
  const { revealed, onTouchStart, onTouchEnd } = useSwipeReveal();
  // On Sent the dot also means "your partner hasn't opened it yet" —
  // separate from `isUnreadForMe` (a reply you haven't opened), so a
  // still-unseen note stays flagged even once you've reread it.
  const sent = view === "sent";
  const flagged = t.isUnreadForMe || (sent && !t.isSeenByPartner);
  // Like Mail: a status only when it asks for something, then the
  // category when it isn't the everyday one, then a preview of the message.
  const status = t.isUnreadForMe ? "New reply" : sent && !t.isSeenByPartner ? "Not read yet" : null;
  const meta = [
    view === "favourites" ? (t.isMine ? `To ${partnerLabel}` : `From ${partnerLabel}`) : null,
    t.category !== "note" ? NOTE_CATEGORY_LABEL[t.category] : null,
  ].filter(Boolean);
  const [firstLine, ...rest] = t.body.trim().split("\n");
  const title = t.subject || firstLine;
  const preview = (t.subject ? t.body : rest.join(" ")).replace(/\s+/g, " ").trim();

  return (
    <div
      className="group flex items-start gap-1 pr-3.5 pl-2.5 transition-colors hover:bg-black/[0.03]"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button type="button" onClick={() => onOpen(t.id)} className="flex min-w-0 flex-1 items-start gap-1.5 py-2.5 text-left">
        <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
          {flagged && <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm" style={{ fontWeight: flagged ? 600 : 500, color: "var(--text-primary)" }}>
              {title}
            </span>
            {t.isFavouritedByMe && (
              <span className="shrink-0" style={{ color: ACCENT }} role="img" aria-label="Favourite">
                <StarIcon filled size={11} />
              </span>
            )}
            <span className="shrink-0 text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-muted)" }}>
              {formatNoteTimestampShort(t.lastMessageAt)}
            </span>
          </span>
          {(status || meta.length > 0 || preview) && (
            <span className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              {status && (
                <>
                  <span className="font-medium" style={{ color: ACCENT }}>
                    {status}
                  </span>
                  {(meta.length > 0 || preview) && " · "}
                </>
              )}
              {meta.length > 0 && (
                <>
                  {meta.join(" · ")}
                  {preview && " · "}
                </>
              )}
              {preview}
            </span>
          )}
        </span>
      </button>

      <div className={clsx("flex shrink-0 items-center gap-0.5 self-center transition-opacity", revealed ? SWIPE_REVEAL_CLASS.shown : SWIPE_REVEAL_CLASS.hidden)}>
        <RowAction onClick={onToggleFavourite} active={t.isFavouritedByMe} label={t.isFavouritedByMe ? "Remove favourite" : "Favourite"} disabled={busy}>
          <StarIcon filled={t.isFavouritedByMe} size={14} />
        </RowAction>
        {sent ? null : t.isUnreadForMe ? (
          <RowAction onClick={onMarkRead} label="Mark as read" disabled={busy}>
            <EyeIcon size={15} />
          </RowAction>
        ) : (
          <RowAction onClick={onMarkUnread} label="Mark as unread" disabled={busy}>
            <EyeOffIcon size={15} />
          </RowAction>
        )}
      </div>
    </div>
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
  /** Favourite and read/unread work without opening a note first (delete
   * lives inside the open thread). Injected
   * (not called directly) for the same demo/real split as NoteThreadView. */
  onToggleFavourite: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
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
    return <ErrorState what="your notes" />;
  }

  if (threads.length === 0) {
    const copy = VIEW_EMPTY_COPY[view];
    return <InlineEmpty title={copy.title} description={copy.description} />;
  }

  return (
    <div className="inset-rows rounded-xl border [--row-inset:1.5rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      {threads.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          view={view}
          partnerLabel={partnerLabel}
          busy={busyId === t.id}
          onOpen={onOpen}
          onToggleFavourite={() => void run(t.id, () => onToggleFavourite(t.id, t.isMine, !t.isFavouritedByMe))}
          onMarkRead={() => void run(t.id, () => onMarkRead(t.id, t.isMine))}
          onMarkUnread={() => void run(t.id, () => onMarkUnread(t.id, t.isMine))}
        />
      ))}
    </div>
  );
}
