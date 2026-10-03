"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { NOTE_CATEGORY_LABEL, type NoteMessage, type NoteThread } from "@/lib/supabase/notes";
import { CategoryIcon, EyeOffIcon, StarIcon } from "./icons";
import { formatNoteTimestamp, formatNoteTimestampShort } from "./NoteThreadList";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { keepFieldFocus } from "@/components/ui/SearchField";
import { useVisualViewportInsets } from "@/lib/useVisualViewport";
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
  /** `replyToId` quotes an earlier message in the thread. */
  onReply: (rootId: string, recipientId: string, body: string, replyToId?: string | null) => Promise<NoteMessage>;
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
  const [replyTo, setReplyTo] = useState<NoteMessage | null>(null);
  // The bubble whose Reply / Copy menu is open (a long-press on a phone).
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const replyFieldRef = useRef<HTMLTextAreaElement>(null);
  // With the iOS keyboard up the visible area scrolls inside the page, so
  // the header and reply bar pin to what's on screen, not the page edges.
  const viewport = useVisualViewportInsets();
  const keyboardUp = viewport.bottom > 80;
  const [remindState, setRemindState] = useState<"idle" | "sending" | "sent" | "no-push" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    // Resetting for the newly-opened thread — an external-system read
    // about to follow, not a React-state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    setLoadError(false);
    setRemindState("idle");
    setReplyTo(null);
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

  // Like Messages: a conversation opens on its newest bubble, and sending
  // keeps the new one in view (a reply arriving only scrolls if you're at the end).
  const shownCount = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!messages) {
      shownCount.current = null;
      return;
    }
    const first = shownCount.current === null;
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
    const grew = !first && messages.length > (shownCount.current ?? 0) && (messages[messages.length - 1].isMine || nearBottom);
    shownCount.current = messages.length;
    if (first || grew) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: first ? "auto" : "smooth" });
  }, [messages]);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setReplying(true);
    setReplyError(null);
    try {
      const recipientId = thread.isMine ? thread.recipientId : thread.senderId;
      const sent = await onReply(thread.id, recipientId, replyBody, replyTo?.id ?? null);
      setReplyBody("");
      setReplyTo(null);
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

  function startReply(m: NoteMessage) {
    setMenuFor(null);
    setReplyTo(m);
    replyFieldRef.current?.focus();
  }

  function jumpTo(id: string) {
    document.getElementById(`note-msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    window.setTimeout(() => setHighlighted((h) => (h === id ? null : h)), 1200);
  }

  const byId = new Map((messages ?? []).map((m) => [m.id, m]));
  const authorOf = (m: NoteMessage) => (m.isMine ? "You" : partnerLabel);

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
        style={{ background: "var(--page-backdrop)", borderBottom: "1px solid var(--border-hairline)", top: viewport.top || undefined }}
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
                <MessageBubble
                  message={m}
                  quoted={m.replyToId ? (byId.get(m.replyToId) ?? null) : null}
                  quotedAuthor={(q) => authorOf(q)}
                  partnerLabel={partnerLabel}
                  highlighted={highlighted === m.id}
                  menuOpen={menuFor === m.id}
                  onOpenMenu={() => setMenuFor(m.id)}
                  onCloseMenu={() => setMenuFor(null)}
                  onReply={() => startReply(m)}
                  onJumpToQuote={jumpTo}
                />
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
        style={{ background: "var(--page-backdrop)", bottom: keyboardUp ? viewport.bottom : undefined }}
      >
        <form
          onSubmit={handleReply}
          className="flex flex-col rounded-[20px] border p-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          {replyTo && (
            <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-0.5">
              <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold" style={{ color: ACCENT }}>
                  Replying to {authorOf(replyTo) === "You" ? "yourself" : partnerLabel}
                </span>
                <span className="block truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  {replyTo.body}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="tap-target flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ color: "var(--text-muted)" }}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5">
          <AutoGrowTextarea
            ref={replyFieldRef}
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
            onMouseDown={keepFieldFocus}
            disabled={replying || !replyBody.trim()}
            aria-label={replying ? "Sending reply" : "Send reply"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--on-accent)] transition-opacity disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 16V4.5M5 9.2l5-4.7 5 4.7" />
            </svg>
          </button>
          </div>
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

const LONG_PRESS_MS = 450;

/** One message. A long-press (phone) or the ↩ that appears on hover
 * (desktop) offers Reply; a reply shows the message it quotes on top,
 * tappable to jump back to it — Messages' and Messenger's pattern. */
function MessageBubble({
  message: m,
  quoted,
  quotedAuthor,
  partnerLabel,
  highlighted,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onReply,
  onJumpToQuote,
}: {
  message: NoteMessage;
  quoted: NoteMessage | null;
  quotedAuthor: (m: NoteMessage) => string;
  partnerLabel: string;
  highlighted: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onReply: () => void;
  onJumpToQuote: (id: string) => void;
}) {
  const press = useRef<number | null>(null);
  const cancelPress = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };

  return (
    <div
      id={`note-msg-${m.id}`}
      className={`group relative flex max-w-[80%] items-center gap-1.5 ${m.isMine ? "flex-row-reverse self-end" : "self-start"} ${menuOpen ? "z-30" : ""}`}
    >
      <div
        className={`min-w-0 rounded-2xl px-3.5 py-2 transition-shadow select-none [-webkit-touch-callout:none] sm:select-text ${menuOpen ? "relative z-30" : ""}`}
        style={{
          background: m.isMine ? ACCENT : "var(--surface-1)",
          color: m.isMine ? "var(--on-accent)" : "var(--text-primary)",
          boxShadow: highlighted
            ? `0 0 0 3px color-mix(in oklab, ${ACCENT} 35%, transparent)`
            : m.isMine
              ? "none"
              : "inset 0 0 0 1px var(--border-hairline)",
        }}
        onTouchStart={() => {
          cancelPress();
          press.current = window.setTimeout(() => {
            press.current = null;
            navigator.vibrate?.(10);
            onOpenMenu();
          }, LONG_PRESS_MS);
        }}
        onTouchMove={cancelPress}
        onTouchEnd={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu();
        }}
      >
        <span className="sr-only">{m.isMine ? "You" : partnerLabel}: </span>
        {quoted && (
          <button
            type="button"
            onClick={() => onJumpToQuote(quoted.id)}
            className="mb-1.5 block w-full rounded-lg px-2.5 py-1.5 text-left"
            style={{
              background: m.isMine ? "color-mix(in oklab, var(--on-accent) 18%, transparent)" : "var(--page-plane)",
              borderLeft: `3px solid ${m.isMine ? "var(--on-accent)" : ACCENT}`,
            }}
          >
            <span className="block text-xs font-semibold" style={{ opacity: 0.9 }}>
              {quotedAuthor(quoted)}
            </span>
            <span className="line-clamp-2 block text-xs" style={{ opacity: 0.85 }}>
              {quoted.body}
            </span>
          </button>
        )}
        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
      </div>
      <button
        type="button"
        onClick={onReply}
        aria-label="Reply"
        className="tap-target hidden h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-fine:flex"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 5 3.5 9.5 8 14" />
          <path d="M4 9.5h7.5a5 5 0 0 1 5 5V16" />
        </svg>
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" aria-hidden="true" onClick={onCloseMenu} />
          <div role="menu" className={`menu-surface absolute top-full z-30 mt-1.5 min-w-44 p-1.5 ${m.isMine ? "right-0" : "left-0"}`}>
            <button type="button" role="menuitem" onClick={onReply} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="flex-1">Reply</span>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 5 3.5 9.5 8 14" />
                <path d="M4 9.5h7.5a5 5 0 0 1 5 5V16" />
              </svg>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(m.body);
                onCloseMenu();
              }}
              className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="flex-1">Copy</span>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                <rect x="6.5" y="6.5" width="10" height="10" rx="2" />
                <path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
