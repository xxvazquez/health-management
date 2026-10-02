"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NOTE_CATEGORY_LABEL, type NoteMessage, type NoteThread } from "@/lib/supabase/notes";
import { CategoryIcon, EyeOffIcon, StarIcon } from "./icons";
import { formatNoteTimestamp, formatNoteTimestampShort } from "./NoteThreadList";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrashIcon } from "@/components/ui/Notebook";
import { MoreMenu, type MoreMenuItem } from "@/components/ui/MoreMenu";

const ACCENT = "var(--series-magenta)";

/** One open thread — every message (root + replies) plus a reply box and
 * the per-thread actions behind the ⋯ menu (remind, favourite, mark unread,
 * delete; "mark read" itself isn't a button, it just happens on open). Opening a thread
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
  onDelete,
  onReply,
  onRemind,
}: {
  thread: NoteThread;
  partnerLabel: string;
  onBack: () => void;
  onChanged: () => void;
  fetchMessages: (rootId: string) => Promise<NoteMessage[]>;
  onMarkRead: (threadId: string, isMine: boolean) => Promise<void>;
  onMarkUnread: (threadId: string, isMine: boolean) => Promise<void>;
  onToggleFavourite: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
  /** Deletes the whole conversation, every reply included, for both partners. */
  onDelete: (threadId: string) => Promise<void>;
  onReply: (rootId: string, recipientId: string, body: string) => Promise<NoteMessage>;
  /** Re-notifies the partner about a thread they haven't read; resolves
   * false when they have no device with push on. */
  onRemind: (threadId: string) => Promise<boolean>;
}) {
  const [messages, setMessages] = useState<NoteMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [remindState, setRemindState] = useState<"idle" | "sending" | "sent" | "no-push" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    // Resetting for the newly-opened thread — an external-system read
    // about to follow, not a React-state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    setLoadError(false);
    setRemindState("idle");
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

  async function handleDelete() {
    setBusy(true);
    setDeleteError(null);
    try {
      await onDelete(thread.id);
      setConfirmingDelete(false);
      onChanged();
      onBack();
    } catch (err) {
      console.error("onDelete failed", err);
      setConfirmingDelete(false);
      setDeleteError("Couldn't delete this conversation — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setRemindState("sending");
    try {
      setRemindState((await onRemind(thread.id)) ? "sent" : "no-push");
    } catch (err) {
      console.error("onRemind failed", err);
      setRemindState("error");
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

  const lastIsMine = !!messages && messages.length > 0 && messages[messages.length - 1].isMine;
  const canRemind = lastIsMine && !thread.isSeenByPartner && remindState !== "sent" && remindState !== "sending";
  const menuItems: MoreMenuItem[] = [
    ...(canRemind ? [{ label: `Remind ${partnerLabel}`, icon: <BellIcon />, onClick: () => void remind() }] : []),
    {
      label: thread.isFavouritedByMe ? "Remove from Favourites" : "Add to Favourites",
      icon: <StarIcon filled={thread.isFavouritedByMe} size={14} />,
      onClick: () => void toggleFavourite(),
    },
    { label: "Mark as Unread", icon: <EyeOffIcon size={14} />, onClick: () => void markUnread() },
    { label: "Delete Conversation", icon: <TrashIcon size={14} />, destructive: true, separated: true, onClick: () => setConfirmingDelete(true) },
  ];

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col gap-4 lg:min-h-[calc(100dvh-10rem)]">
      {/* Pinned like Messages' navigation bar, so Back and the title stay
          in reach in a long conversation; it clears the notch on a phone. */}
      <div
        className="sticky top-0 z-10 -mx-4 -mt-[env(safe-area-inset-top)] grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
        style={{ background: "var(--page-backdrop)", borderBottom: "1px solid var(--border-hairline)" }}
      >
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
        <div className="justify-self-end">
          <MoreMenu disabled={busy} items={menuItems} />
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this conversation?"
          message={`Every message in it is removed for you and ${partnerLabel}. This can't be undone.`}
          confirmLabel="Delete"
          destructive
          busy={busy}
          onConfirm={() => void handleDelete()}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
      {deleteError && (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          {deleteError}
        </p>
      )}

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
                    color: m.isMine ? "var(--on-accent)" : "var(--text-primary)",
                    boxShadow: m.isMine ? "none" : "inset 0 0 0 1px var(--border-hairline)",
                  }}
                >
                  <span className="sr-only">{m.isMine ? "You" : partnerLabel}: </span>
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            );
          })}
          {lastIsMine && (
            <p className="text-right text-xs" style={{ color: remindState === "error" ? "var(--status-critical)" : "var(--text-muted)" }}>
              {thread.isSeenByPartner
                ? `Read${thread.partnerReadAt ? ` ${formatNoteTimestampShort(thread.partnerReadAt)}` : ""}`
                : remindState === "sent"
                  ? "Delivered · Reminded just now"
                  : remindState === "sending"
                    ? "Delivered · Reminding…"
                    : remindState === "no-push"
                      ? `Delivered · ${partnerLabel} has notifications off`
                      : remindState === "error"
                        ? "Delivered · Reminder didn't send"
                        : "Delivered"}
            </p>
          )}
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--on-accent)] transition-opacity disabled:opacity-40"
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

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8.5a5 5 0 0 1 10 0c0 3.5 1.5 5 1.5 5h-13S5 12 5 8.5Z" />
      <path d="M8.3 16.5a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}
