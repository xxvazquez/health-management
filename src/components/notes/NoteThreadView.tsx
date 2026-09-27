"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NOTE_CATEGORY_LABEL, type NoteMessage, type NoteThread } from "@/lib/supabase/notes";
import { ArchiveIcon, CategoryIcon, EyeOffIcon, StarIcon } from "./icons";
import { formatNoteTimestamp } from "./NoteThreadList";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";

const ACCENT = "var(--series-magenta)";

function ActionButton({
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="tap-target flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-40"
      style={{ color: active ? ACCENT : "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
}

/** One open thread — every message (root + replies) plus a reply box and
 * the four per-thread actions (favourite, mark unread, archive; "mark
 * read" itself isn't a button, it just happens on open). Opening a thread
 * you're the recipient of marks it read immediately, same as any inbox.
 * Every action is injected rather than calling supabase/notes.ts directly,
 * so the Notes page can wire either the real Supabase calls or the
 * signed-out demo's local-only versions through the exact same UI — same
 * "one component, two callback sources" shape as Manage's demo/real split. */
export function NoteThreadView({
  thread,
  partnerLabel,
  onBack,
  onChanged,
  fetchMessages,
  onMarkRead,
  onMarkUnread,
  onToggleFavourite,
  onToggleArchive,
  onReply,
}: {
  thread: NoteThread;
  partnerLabel: string;
  onBack: () => void;
  onChanged: () => void;
  fetchMessages: (rootId: string) => Promise<NoteMessage[]>;
  onMarkRead: (threadId: string, isMine: boolean) => Promise<void>;
  onMarkUnread: (threadId: string, isMine: boolean) => Promise<void>;
  onToggleFavourite: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
  onToggleArchive: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
  onReply: (rootId: string, recipientId: string, body: string) => Promise<NoteMessage>;
}) {
  const [messages, setMessages] = useState<NoteMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Resetting for the newly-opened thread — an external-system read
    // about to follow, not a React-state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    setLoadError(false);
    fetchMessages(thread.id)
      .then((m) => {
        if (!cancelled) setMessages(m);
      })
      .catch((err) => {
        console.error("fetchMessages failed", err);
        if (!cancelled) setLoadError(true);
      });
    if (thread.isUnreadForMe) void onMarkRead(thread.id, thread.isMine).then(onChanged);
    return () => {
      cancelled = true;
    };
    // Re-runs only when a different thread is opened — the callback props
    // and `thread.isMine` don't change for the same thread mid-view, and
    // `thread.isUnreadForMe` is only meaningful for the initial mark-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setReplying(true);
    setReplyError(null);
    try {
      const recipientId = thread.isMine ? thread.recipientId : thread.senderId;
      const sent = await onReply(thread.id, recipientId, replyBody);
      setReplyBody("");
      setMessages((prev) => [...(prev ?? []), sent]);
      onChanged();
    } catch (err) {
      console.error("onReply failed", err);
      setReplyError("Couldn't send that reply — try again.");
    } finally {
      setReplying(false);
    }
  }

  async function toggleFavourite() {
    setBusy(true);
    try {
      await onToggleFavourite(thread.id, thread.isMine, !thread.isFavouritedByMe);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      await onToggleArchive(thread.id, thread.isMine, !thread.isArchivedByMe);
      onChanged();
      onBack();
    } finally {
      setBusy(false);
    }
  }

  async function markUnread() {
    setBusy(true);
    try {
      await onMarkUnread(thread.id, thread.isMine);
      onChanged();
      onBack();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col gap-4 lg:min-h-[calc(100dvh-10rem)]">
      <div className="grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
        <button type="button" onClick={onBack} className="hit-slop justify-self-start text-sm font-medium" style={{ color: ACCENT }}>
          ‹ Back
        </button>
        <div className="flex min-w-0 flex-col items-center text-center">
          <span className="flex items-center gap-1 text-xs font-semibold tracking-wide uppercase" style={{ color: ACCENT }}>
            <CategoryIcon category={thread.category} size={12} />
            {NOTE_CATEGORY_LABEL[thread.category]}
          </span>
          {thread.subject && (
            <h2 className="max-w-full truncate text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {thread.subject}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-0.5 justify-self-end">
          <ActionButton onClick={() => void toggleFavourite()} active={thread.isFavouritedByMe} label={thread.isFavouritedByMe ? "Unfavourite" : "Favourite"} disabled={busy}>
            <StarIcon filled={thread.isFavouritedByMe} />
          </ActionButton>
          <ActionButton onClick={() => void markUnread()} label="Mark as unread" disabled={busy}>
            <EyeOffIcon />
          </ActionButton>
          <ActionButton onClick={() => void toggleArchive()} label={thread.isArchivedByMe ? "Unarchive" : "Archive"} disabled={busy}>
            <ArchiveIcon />
          </ActionButton>
        </div>
      </div>

      {messages === null && !loadError && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      )}
      {loadError && (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load this thread — try again.
        </p>
      )}

      {messages && (
        <div className="flex flex-col gap-1.5">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            // A centred time heads each burst of messages, like Messages does,
            // rather than a stamp under every bubble.
            const showTime = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 60 * 60 * 1000;
            return (
              <div key={m.id} className="flex flex-col gap-1.5">
                {showTime && (
                  <p className="pt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatNoteTimestamp(m.createdAt)}
                  </p>
                )}
                <div
                  className="max-w-[80%] rounded-2xl px-3.5 py-2"
                  style={{
                    alignSelf: m.isMine ? "flex-end" : "flex-start",
                    background: m.isMine ? ACCENT : "var(--surface-1)",
                    color: m.isMine ? "#fff" : "var(--text-primary)",
                    boxShadow: m.isMine ? "none" : "inset 0 0 0 1px var(--border-hairline)",
                  }}
                >
                  <span className="sr-only">{m.isMine ? "You" : partnerLabel}: </span>
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="sticky bottom-[calc(58px+env(safe-area-inset-bottom))] z-10 -mx-4 mt-auto flex flex-col gap-1 px-4 py-2 sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:px-0 lg:pb-4"
        style={{ background: "var(--page-backdrop)" }}
      >
        <form
          onSubmit={handleReply}
          className="flex items-end gap-1.5 rounded-[20px] border p-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          <AutoGrowTextarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={1}
            maxRows={6}
            aria-label={`Reply to ${partnerLabel}`}
            placeholder={`Reply to ${partnerLabel}…`}
            className="row-control min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-5 outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            type="submit"
            disabled={replying || !replyBody.trim()}
            aria-label={replying ? "Sending reply" : "Send reply"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 16V4.5M5 9.2l5-4.7 5 4.7" />
            </svg>
          </button>
        </form>
        {replyError && (
          <p className="text-xs" style={{ color: "var(--status-critical)" }}>
            {replyError}
          </p>
        )}
      </div>
    </div>
  );
}
