"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { SWIPE_REVEAL_CLASS, useSwipeReveal } from "@/lib/useSwipeReveal";
import { EyeIcon, EyeOffIcon, StarIcon } from "./icons";
import { TrashIcon } from "@/components/ui/Notebook";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CONTEXT_OPEN_STYLE, ContextMenu } from "@/components/ui/ContextMenu";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
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

/** Compact per-row action, revealed by a swipe or hover. */
function RowAction({
  onClick,
  active,
  destructive,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  destructive?: boolean;
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
      style={{ color: destructive ? "var(--status-critical)" : active ? ACCENT : "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

/** One conversation. Favourite, read/unread and delete sit behind a left
 * swipe on a phone and appear on hover from `lg`, and open on long-press or
 * right-click, like Messages' row actions. */
function ThreadRow({
  thread: t,
  busy,
  onOpen,
  onToggleFavourite,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  thread: NoteThread;
  busy: boolean;
  onOpen: (id: string) => void;
  onToggleFavourite: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  const { revealed, onTouchStart, onTouchEnd } = useSwipeReveal();
  // Unread for me: a dot, a bold title and a darker preview, like Mail.
  // When I sent the newest message, the line says whether my partner has
  // read it yet.
  const flagged = t.isUnreadForMe;
  const lastIsMine = t.lastMessageIsMine ?? t.isMine;
  const status = flagged ? null : lastIsMine ? (t.isSeenByPartner ? "Read" : "Not read yet") : null;
  const meta = t.category !== "note" ? NOTE_CATEGORY_LABEL[t.category] : null;
  const [firstLine, ...rest] = t.body.trim().split("\n");
  const title = t.subject || firstLine;
  const preview = (t.lastMessage ?? (t.subject ? t.body : rest.join(" "))).replace(/\s+/g, " ").trim();
  const favourite = t.isFavourite;

  return (
    <ContextMenu
      items={[
        { label: favourite ? "Remove from Favourites" : "Add to Favourites", icon: <StarIcon filled={favourite} size={14} />, onClick: onToggleFavourite },
        t.isUnreadForMe
          ? { label: "Mark as Read", icon: <EyeIcon size={14} />, onClick: onMarkRead }
          : { label: "Mark as Unread", icon: <EyeOffIcon size={14} />, onClick: onMarkUnread },
        { label: "Delete", icon: <TrashIcon size={14} />, destructive: true, separated: true, onClick: onDelete },
      ]}
    >
      {(bind, menuOpen) => (
        <div
          className="group flex items-start gap-1 pr-3.5 pl-2.5 transition-colors hover:bg-black/[0.03]"
          style={{ touchAction: "pan-y", ...(menuOpen ? CONTEXT_OPEN_STYLE : {}) }}
          onTouchStart={(e) => {
            onTouchStart(e);
            bind.onTouchStart(e);
          }}
          onTouchMove={bind.onTouchMove}
          onTouchEnd={(e) => {
            onTouchEnd(e);
            bind.onTouchEnd();
          }}
          onTouchCancel={bind.onTouchCancel}
          onContextMenu={bind.onContextMenu}
          onClickCapture={bind.onClickCapture}
        >
          <button type="button" onClick={() => onOpen(t.id)} className="flex min-w-0 flex-1 items-start gap-1.5 py-2.5 text-left">
            <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
              {flagged && <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm" style={{ fontWeight: flagged ? 600 : 400, color: "var(--text-primary)" }}>
                  {title}
                </span>
                {favourite && (
                  <span className="shrink-0" style={{ color: ACCENT }} role="img" aria-label="Favourite">
                    <StarIcon filled size={11} />
                  </span>
                )}
                <span className="shrink-0 text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatNoteTimestampShort(t.lastMessageAt)}
                </span>
              </span>
              {(status || meta || preview) && (
                <span className="mt-0.5 line-clamp-2 text-xs" style={{ color: flagged ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {status && (
                    <>
                      <span className="font-medium" style={{ color: t.isSeenByPartner ? "var(--text-muted)" : ACCENT }}>
                        {status}
                      </span>
                      {(meta || preview) && " · "}
                    </>
                  )}
                  {meta && (
                    <>
                      {meta}
                      {preview && " · "}
                    </>
                  )}
                  {preview}
                </span>
              )}
            </span>
          </button>

          <div className={clsx("flex shrink-0 items-center gap-0.5 self-center transition-opacity", revealed ? SWIPE_REVEAL_CLASS.shown : SWIPE_REVEAL_CLASS.hidden)}>
            <RowAction onClick={onToggleFavourite} active={favourite} label={favourite ? "Remove from Favourites" : "Add to Favourites"} disabled={busy}>
              <StarIcon filled={favourite} size={15} />
            </RowAction>
            {t.isUnreadForMe ? (
              <RowAction onClick={onMarkRead} label="Mark as read" disabled={busy}>
                <EyeIcon size={15} />
              </RowAction>
            ) : (
              <RowAction onClick={onMarkUnread} label="Mark as unread" disabled={busy}>
                <EyeOffIcon size={15} />
              </RowAction>
            )}
            <RowAction onClick={onDelete} destructive label="Delete" disabled={busy}>
              <TrashIcon size={15} />
            </RowAction>
          </div>
        </div>
      )}
    </ContextMenu>
  );
}

function ThreadGroup({ children }: { children: ReactNode }) {
  return (
    <div className="inset-rows rounded-xl border [--row-inset:1.5rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      {children}
    </div>
  );
}

/** The conversations in a folder (All or Favourites), newest activity first. */
export function NoteThreadList({
  threads,
  loading,
  error,
  partnerLabel,
  onOpen,
  onToggleFavourite,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onChanged,
  view,
}: {
  threads: NoteThread[];
  loading: boolean;
  error: boolean;
  partnerLabel: string;
  onOpen: (id: string) => void;
  /** Injected (not called directly) for the same demo/real split as NoteThreadView. */
  onToggleFavourite: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
  onMarkRead: (threadId: string, isMine: boolean) => Promise<void>;
  onMarkUnread: (threadId: string, isMine: boolean) => Promise<void>;
  /** Deletes the whole conversation for both partners. */
  onDelete: (threadId: string) => Promise<void>;
  onChanged: () => void;
  view: NoteView;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteThread | null>(null);

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

  if (loading) return <ListSkeleton />;

  if (error) {
    return <ErrorState what="your messages" />;
  }

  if (threads.length === 0) {
    return view === "favourites" ? (
      <InlineEmpty title="No favourites yet" description="Swipe a conversation, or long-press it, to add it to Favourites." />
    ) : (
      <InlineEmpty title="No messages yet" description="Tap + to send your partner something." />
    );
  }

  const row = (t: NoteThread) => (
    <ThreadRow
      key={t.id}
      thread={t}
      busy={busyId === t.id}
      onOpen={onOpen}
      onToggleFavourite={() => void run(t.id, () => onToggleFavourite(t.id, t.isMine, !t.isFavourite))}
      onMarkRead={() => void run(t.id, () => onMarkRead(t.id, t.isMine))}
      onMarkUnread={() => void run(t.id, () => onMarkUnread(t.id, t.isMine))}
      onDelete={() => setConfirmDelete(t)}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <ThreadGroup>{threads.map(row)}</ThreadGroup>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this conversation?"
          message={`Every message in it is removed for you and ${partnerLabel}. This can't be undone.`}
          confirmLabel="Delete"
          destructive
          busy={busyId === confirmDelete.id}
          onConfirm={() => {
            const id = confirmDelete.id;
            void run(id, () => onDelete(id)).then(() => setConfirmDelete(null));
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
