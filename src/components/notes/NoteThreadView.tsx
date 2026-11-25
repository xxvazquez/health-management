"use client";

import { ListSkeleton } from "@/components/ui/Skeleton";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { type NoteMessage, type NoteThread } from "@/lib/supabase/notes";
import { EyeOffIcon, PinIcon } from "./icons";
import { formatNoteTimestamp, formatNoteTimestampShort } from "./NoteThreadList";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { keepFieldFocus } from "@/components/ui/SearchField";
import { useVisualViewportInsets } from "@/lib/useVisualViewport";
import { useSoftKeyboardOpen } from "@/lib/useSoftKeyboard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrashIcon } from "@/components/ui/Notebook";
import { MoreMenu, type MoreMenuItem } from "@/components/ui/MoreMenu";

const ACCENT = "var(--series-magenta)";

/** One open thread — every message (root + replies) plus a reply box and
 * the per-thread actions behind the ⋯ menu (remind, pin, mark unread,
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
  onTogglePin,
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
  onTogglePin: (threadId: string, isMine: boolean, next: boolean) => Promise<void>;
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
  // An unsent reply is kept on this device per conversation, like iMessage.
  const draftKey = `lauva:reply-draft:${thread.id}`;
  const [replyBody, setReplyBody] = useState(() => readDraft(draftKey));
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
  const rootRef = useRef<HTMLDivElement>(null);
  const replyBarRef = useRef<HTMLDivElement>(null);
  // With the iOS keyboard up the visible area scrolls inside the page, so
  // the header and reply bar pin to what's on screen, not the page edges.
  const viewport = useVisualViewportInsets();
  const keyboardUp = useSoftKeyboardOpen();
  // Like Messages: with the keyboard up the conversation becomes a fixed
  // layer over exactly the visible area — header on top, reply bar on the
  // keyboard, bubbles scrolling between — so typing never moves the page.
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!keyboardUp || !list) return;
    list.scrollTop = list.scrollHeight;
    // A growing reply field shrinks the list; keep the newest bubble in view.
    let atEnd = true;
    const onScroll = () => {
      atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    };
    const observer = new ResizeObserver(() => {
      if (atEnd) list.scrollTop = list.scrollHeight;
    });
    list.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [keyboardUp]);
  useEffect(() => {
    document.documentElement.setAttribute("data-conversation", "");
    return () => document.documentElement.removeAttribute("data-conversation");
  }, []);
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
    setReplyBody(readDraft(draftKey));
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

  useEffect(() => {
    try {
      if (replyBody.trim()) localStorage.setItem(draftKey, replyBody);
      else localStorage.removeItem(draftKey);
    } catch {
      // Storage unavailable: the draft just isn't kept.
    }
  }, [draftKey, replyBody]);

  // Like Messages: a conversation opens on its newest bubble, and sending
  // keeps the new one in view (a reply arriving only scrolls if you're at the end).
  const shownCount = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!messages) {
      shownCount.current = null;
      return;
    }
    const list = listRef.current;
    if (keyboardUp && list) {
      const grewWhilePinned = shownCount.current !== null && messages.length > shownCount.current;
      shownCount.current = messages.length;
      if (grewWhilePinned) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      return;
    }
    // The newest bubble sits right above the pinned reply bar — the end of
    // the conversation, not the end of the page (the footer stays below).
    const root = rootRef.current;
    const bar = replyBarRef.current;
    const end = root && bar
      ? root.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + (parseFloat(getComputedStyle(bar).bottom) || 0)
      : document.documentElement.scrollHeight;
    const first = shownCount.current === null;
    const nearBottom = window.scrollY >= end - 240;
    const grew = !first && messages.length > (shownCount.current ?? 0) && (messages[messages.length - 1].isMine || nearBottom);
    shownCount.current = messages.length;
    if (first || grew) window.scrollTo({ top: end, behavior: first ? "auto" : "smooth" });
    // Only a change in messages scrolls; the keyboard has its own effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (replying || !replyBody.trim()) return;
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

  async function togglePin() {
    setBusy(true);
    try {
      await onTogglePin(thread.id, thread.isMine, !thread.isPinned);
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
      label: thread.isPinned ? "Unpin" : "Pin",
      icon: <PinIcon filled={thread.isPinned} size={14} />,
      onClick: () => void togglePin(),
    },
    { label: "Mark as Unread", icon: <EyeOffIcon size={14} />, onClick: () => void markUnread() },
    { label: "Delete Conversation", icon: <TrashIcon size={14} />, destructive: true, separated: true, onClick: () => setConfirmingDelete(true) },
  ];

  return (
    <div
      ref={rootRef}
      className={
        keyboardUp
          ? "fixed inset-x-0 z-40 flex flex-col gap-4 px-4 sm:px-6"
          : "flex min-h-[calc(100dvh-58px-env(safe-area-inset-bottom))] flex-col gap-4 lg:min-h-[calc(100dvh-4rem)]"
      }
      style={keyboardUp ? { top: viewport.top, bottom: viewport.bottom, background: "var(--page-backdrop)" } : undefined}
    >
      {/* Pinned like Messages' navigation bar, so Back and the title stay
          in reach in a long conversation; it clears the notch on a phone. */}
      <div
        className="sticky top-0 z-10 -mx-4 -mt-[env(safe-area-inset-top)] grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
        style={{ background: "var(--page-backdrop)", borderBottom: "1px solid var(--border-hairline)", ...(keyboardUp ? { position: "relative", top: 0, marginTop: 0 } : { top: viewport.top || undefined }) }}
      >
        <button type="button" onClick={onBack} className="hit-slop justify-self-start text-sm font-medium" style={{ color: ACCENT }}>
          ‹ Back
        </button>
        {/* Like Messages, the bar is titled by the conversation itself. */}
        <h2 className="min-w-0 truncate text-center text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {thread.subject || thread.body.trim().split("\n")[0]}
        </h2>
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
        <ListSkeleton rows={3} />
      )}
      {loadError && (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load this thread — try again.
        </p>
      )}

      {messages && (
        <div ref={listRef} className={keyboardUp ? "-mx-4 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-4 sm:-mx-6 sm:px-6" : "mt-auto flex flex-col gap-1.5"}>
          {/* Few bubbles sit at the bottom, right above the reply bar. */}
          {keyboardUp && <div className="mt-auto" aria-hidden="true" />}
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
        ref={replyBarRef}
        className={`sticky bottom-[calc(58px+env(safe-area-inset-bottom))] z-10 -mx-4 ${messages ? "" : "mt-auto"} flex flex-col gap-1 px-4 py-2 sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:px-0 lg:pb-4`}
        style={{ background: "var(--page-backdrop)", ...(keyboardUp ? { position: "relative", bottom: 0 } : null) }}
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
            onKeyDown={(e) => {
              // With a keyboard and mouse, Return sends and Shift-Return adds
              // a line, as in Messages on the Mac; on a phone Return is a line break.
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || !window.matchMedia("(pointer: fine)").matches) return;
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
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

function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
