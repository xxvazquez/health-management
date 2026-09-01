"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NOTE_CATEGORY_LABEL, type NoteMessage, type NoteThread } from "@/lib/supabase/notes";
import { ArchiveIcon, CategoryIcon, EnvelopeOpenIcon, ReplyIcon, StarIcon } from "./icons";
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
      className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40"
      style={{ color: active ? ACCENT : "var(--text-secondary)", background: "var(--page-plane)" }}
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
  onReply: (rootId: string, recipientId: string, body: string) => Promise<unknown>;
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
      await onReply(thread.id, recipientId, replyBody);
      setReplyBody("");
      setMessages(await fetchMessages(thread.id));
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          ← Back
        </button>
        <div className="flex items-center gap-1">
          <ActionButton onClick={() => void toggleFavourite()} active={thread.isFavouritedByMe} label={thread.isFavouritedByMe ? "Unfavourite" : "Favourite"} disabled={busy}>
            <StarIcon filled={thread.isFavouritedByMe} />
          </ActionButton>
          <ActionButton onClick={() => void markUnread()} label="Mark as unread" disabled={busy}>
            <EnvelopeOpenIcon />
          </ActionButton>
          <ActionButton onClick={() => void toggleArchive()} active={thread.isArchivedByMe} label={thread.isArchivedByMe ? "Unarchive" : "Archive"} disabled={busy}>
            <ArchiveIcon />
          </ActionButton>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2" style={{ color: ACCENT }}>
          <CategoryIcon category={thread.category} size={16} />
          <span className="text-xs font-semibold tracking-wide uppercase">{NOTE_CATEGORY_LABEL[thread.category]}</span>
        </div>
        {thread.subject && (
          <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {thread.subject}
          </h2>
        )}
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
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className="max-w-[85%] rounded-xl border px-3.5 py-2.5"
              style={{
                alignSelf: m.isMine ? "flex-end" : "flex-start",
                borderColor: m.isMine ? ACCENT : "var(--border-hairline)",
                background: m.isMine ? "color-mix(in oklab, var(--series-magenta) 10%, var(--surface-1))" : "var(--surface-1)",
              }}
            >
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                {m.body}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {m.isMine ? "You" : partnerLabel} · {formatNoteTimestamp(m.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleReply} className="flex items-end gap-2 border-t pt-4" style={{ borderColor: "var(--gridline)" }}>
        <AutoGrowTextarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={2}
          maxRows={8}
          placeholder={`Reply to ${partnerLabel}…`}
          className="flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={replying || !replyBody.trim()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          <ReplyIcon size={13} />
          {replying ? "Sending…" : "Reply"}
        </button>
      </form>
      {replyError && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {replyError}
        </p>
      )}
    </div>
  );
}
