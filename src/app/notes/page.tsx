"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDrillDown } from "@/lib/useDrillDown";
import { usePreferences } from "@/lib/usePreferences";
import { navTransition } from "@/lib/navTransition";
import { useAuth } from "@/lib/supabase/AuthContext";
import { getPartnerLink, type PartnerLink } from "@/lib/supabase/partner";
import {
  fetchNoteThread,
  fetchNoteThreads,
  fetchThreadMessages,
  markAllThreadsRead,
  markThreadRead,
  markThreadUnread,
  remindPartner,
  replyToNote,
  deleteThread,
  sendNote,
  setThreadPinned,
  type NewNoteInput,
  type NoteMessage,
  type NoteThread,
} from "@/lib/supabase/notes";
import { buildDemoMessages, buildDemoThreads, DEMO_ME_ID, DEMO_PARTNER_ID, DEMO_PARTNER_LABEL } from "@/lib/demoNotes";
import { hasOutboxEntriesForTables, readSnapshot, writeSnapshot } from "@/lib/db/indexedDb";
import { onCloudRefresh } from "@/lib/cloudRefresh";
import { PartnerLinkPanel } from "@/components/notes/PartnerLinkPanel";
import { ComposeNoteDialog } from "@/components/notes/ComposeNoteDialog";
import { NoteThreadList } from "@/components/notes/NoteThreadList";
import { NoteThreadView } from "@/components/notes/NoteThreadView";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { PageHeading } from "@/components/ui/PageHeading";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { MoreMenu } from "@/components/ui/MoreMenu";

const ACCENT = "var(--series-magenta)";
// Never the partner's email — that's private data the app shouldn't surface
// as casual UI copy, so every real-account label reads generically instead.
const PARTNER_LABEL = "your partner";

const NOTES_TABLES = ["notes"] as const;

/** Per-session cache of the resolved partner link, keyed by user id — so
 * navigating back to Notes skips the full-page loading wall. Cleared on
 * sign-out. */
let partnerLinkCache: { userId: string; link: PartnerLink | null } | null = null;

/** Connect -> Notes: private partner-to-partner messages, deliberately
 * separate from Log (personal logging only) and from Analytics (reads back
 * what you logged) — this is the app's one two-person surface. Signed out
 * (or Supabase not configured — session is always null then too, so this
 * one flag covers both) shows the same kind of example-data preview as
 * every other page instead of a bare "please sign in" wall, mutable
 * locally but never sent anywhere; see demoNotes.ts. */
export default function NotesPage() {
  const { session, loading: authLoading } = useAuth();
  const isDemo = !authLoading && !session;
  const accountId = session?.user?.id ?? null;

  // The partner link rarely changes — cache it across navigations so
  // re-opening Notes doesn't hit the full-page "Loading…" wall every time.
  const cachedPartner = partnerLinkCache && partnerLinkCache.userId === accountId ? partnerLinkCache : null;
  const [partnerState, setPartnerState] = useState<"loading" | "unlinked" | "linked">(
    cachedPartner ? (cachedPartner.link ? "linked" : "unlinked") : "loading",
  );
  const [partnerLink, setPartnerLink] = useState<PartnerLink | null>(cachedPartner?.link ?? null);

  const loadPartner = useCallback(async () => {
    if (!partnerLinkCache) setPartnerState("loading");
    try {
      const link = await getPartnerLink();
      setPartnerLink(link);
      setPartnerState(link ? "linked" : "unlinked");
      if (accountId) partnerLinkCache = { userId: accountId, link };
    } catch (err) {
      console.error("loadPartner failed", err);
      if (!partnerLinkCache) setPartnerState("unlinked");
    }
  }, [accountId]);

  useEffect(() => {
    if (!session) {
      partnerLinkCache = null;
      return;
    }
    // Loading from Supabase on sign-in — an external-system read, not a
    // React-state sync loop, so the async setState it triggers is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPartner();
  }, [session, loadPartner]);

  const [threads, setThreads] = useState<NoteThread[]>([]);
  const { prefs, update: updatePrefs } = usePreferences();
  const pinnedCollapsed = !!prefs.messagesPinnedCollapsed;
  const setPinnedCollapsed = (collapsed: boolean) => updatePrefs({ messagesPinnedCollapsed: collapsed });
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  // Set only via the `?thread=` deep link (see the effect below) — a
  // thread linked from outside might not be in the loaded list yet, so it's
  // fetched and held separately.
  const [directThread, setDirectThread] = useState<NoteThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(false);
    const startedAt = Date.now();
    try {
      const fresh = await fetchNoteThreads();
      // Don't let a server list step on a not-yet-synced local change
      // (relevant once Messages writes go through the outbox).
      if (accountId && (await hasOutboxEntriesForTables(accountId, NOTES_TABLES))) return;
      setThreads(fresh);
      if (accountId) void writeSnapshot(accountId, "notes:all", fresh, startedAt);
    } catch (err) {
      console.error("fetchNoteThreads failed", err);
      const snap = accountId ? await readSnapshot(accountId, "notes:all").catch(() => undefined) : undefined;
      if (snap) setThreads(snap.payload as NoteThread[]);
      else setThreadsError(true);
    } finally {
      setThreadsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (partnerState !== "linked") return;
    // Same reasoning as the loadPartner effect above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThreads();
    return onCloudRefresh(() => void loadThreads());
  }, [partnerState, loadThreads]);

  // Real-mode handlers, all optimistic: the change lands in local state
  // immediately and the write queues (directWrite) if it can't reach
  // Supabase, so Messages works offline the same way the rest of the app
  // does. `loadThreads`'s own pending-write guard keeps a background
  // refresh from clobbering an un-drained change.
  const patchThread = useCallback((threadId: string, patch: Partial<NoteThread>) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, ...patch } : t)));
    setDirectThread((prev) => (prev && prev.id === threadId ? { ...prev, ...patch } : prev));
  }, []);

  const markRead = useCallback(async (threadId: string, isMine: boolean) => {
    patchThread(threadId, { isUnreadForMe: false });
    await markThreadRead(threadId, isMine);
  }, [patchThread]);

  const markUnread = useCallback(async (threadId: string, isMine: boolean) => {
    patchThread(threadId, { isUnreadForMe: true });
    await markThreadUnread(threadId, isMine);
  }, [patchThread]);

  const togglePin = useCallback(async (threadId: string, isMine: boolean, next: boolean) => {
    patchThread(threadId, { isPinned: next });
    await setThreadPinned(threadId, isMine, next);
  }, [patchThread]);

  const removeThread = useCallback(async (threadId: string) => {
    await deleteThread(threadId);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

  const send = useCallback(async (input: NewNoteInput) => {
    const id = await sendNote(input);
    if (accountId) {
      const nowIso = new Date().toISOString();
      setThreads((prev) => [
        {
          id,
          senderId: accountId,
          recipientId: input.recipientId,
          category: input.category,
          subject: input.subject.trim() || null,
          body: input.body.trim(),
          createdAt: nowIso,
          lastMessageAt: nowIso,
          isUnreadForMe: false,
          isSeenByPartner: false,
          partnerReadAt: null,
          isPinned: false,
          isMine: true,
        },
        ...prev,
      ]);
    }
    return id;
  }, [accountId]);

  const reply = useCallback(async (rootId: string, recipientId: string, body: string, replyToId: string | null = null): Promise<NoteMessage> => {
    const msg = await replyToNote(rootId, recipientId, body, replyToId);
    patchThread(rootId, { lastMessageAt: msg.createdAt, lastMessage: msg.body, isUnreadForMe: false });
    return msg;
  }, [patchThread]);

  const handleMarkAllRead = useCallback(async () => {
    setThreads((prev) => prev.map((t) => ({ ...t, isUnreadForMe: false })));
    try {
      await markAllThreadsRead(threads);
    } catch (err) {
      console.error("markAllThreadsRead failed", err);
    }
  }, [threads]);

  // One-time deep-link resolution: `/notes?thread=<id>` opens that thread
  // directly regardless of which list is loaded. Only meaningful once a
  // partner is actually linked — demo mode's own thread ids are already in
  // `demoThreads` regardless of tab, so it never needs this fetch at all.
  useEffect(() => {
    if (partnerState !== "linked") return;
    const id = new URLSearchParams(window.location.search).get("thread");
    if (!id) return;
    fetchNoteThread(id)
      .then((t) => {
        if (t) {
          setDirectThread(t);
          setSelectedThreadId(t.id);
        }
      })
      .catch((err) => console.error("fetchNoteThread failed", err));
  }, [partnerState]);

  // Same deep link, demo-mode version — demo thread ids are already in
  // `demoThreads` regardless of tab (see below), so this just needs to set
  // `selectedThreadId`, no fetch. Separate from the effect above because it
  // has to fire on `isDemo` becoming true instead of `partnerState`, which
  // never leaves "loading" for a signed-out visitor.
  useEffect(() => {
    if (!isDemo) return;
    const id = new URLSearchParams(window.location.search).get("thread");
    // Reading the URL on mount — an external-system read, not a React-state
    // sync loop, same reasoning as every other deep-link/mount effect here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setSelectedThreadId(id);
  }, [isDemo]);

  // --- Demo mode: same shape as the real handlers above, but reading/
  // writing local state instead of Supabase (see demoNotes.ts). Reused
  // through the exact same NoteThreadList/NoteThreadView/ComposeNoteDialog
  // components as the real flow — only the callbacks differ, same "one
  // component, two callback sources" split Manage's demo mode already uses.
  const [demoThreads, setDemoThreads] = useState<NoteThread[]>(() => buildDemoThreads());
  // A ref, not state — demoFetchMessages is called imperatively right
  // after demoReply resolves (see NoteThreadView's handleReply), in the
  // same tick, before this component re-renders. Reading from state there
  // would see the pre-reply closure (React batches the state update),
  // silently dropping the reply that was just "sent". The ref is mutated
  // synchronously inside demoReply, so the very next read always sees it —
  // matches how the real fetchThreadMessages behaves (a fresh server
  // query, never a stale closure) through the same NoteThreadView code path.
  const demoRepliesRef = useRef<Record<string, NoteMessage[]>>({});

  const demoFetchMessages = useCallback(
    async (rootId: string): Promise<NoteMessage[]> => [...buildDemoMessages(rootId, demoThreads), ...(demoRepliesRef.current[rootId] ?? [])],
    [demoThreads],
  );
  const demoSetField = useCallback((threadId: string, patch: Partial<NoteThread>) => {
    setDemoThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, ...patch } : t)));
  }, []);
  const demoMarkRead = useCallback(async (threadId: string) => demoSetField(threadId, { isUnreadForMe: false }), [demoSetField]);
  const demoMarkUnread = useCallback(async (threadId: string) => demoSetField(threadId, { isUnreadForMe: true }), [demoSetField]);
  const demoMarkAllRead = useCallback(async () => {
    setDemoThreads((prev) => prev.map((t) => ({ ...t, isUnreadForMe: false })));
  }, []);
  const demoTogglePin = useCallback(
    async (threadId: string, _isMine: boolean, next: boolean) => demoSetField(threadId, { isPinned: next }),
    [demoSetField],
  );
  const demoDelete = useCallback(async (threadId: string) => {
    setDemoThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);
  const demoReply = useCallback(async (rootId: string, _recipientId: string, body: string, replyToId: string | null = null): Promise<NoteMessage> => {
    const message: NoteMessage = { id: `demo-reply-${Date.now()}`, senderId: DEMO_ME_ID, isMine: true, body, createdAt: new Date().toISOString(), replyToId };
    demoRepliesRef.current = { ...demoRepliesRef.current, [rootId]: [...(demoRepliesRef.current[rootId] ?? []), message] };
    demoSetField(rootId, { lastMessageAt: message.createdAt, lastMessage: message.body });
    return message;
  }, [demoSetField]);
  const demoSend = useCallback(async (input: NewNoteInput) => {
    const nowIso = new Date().toISOString();
    setDemoThreads((prev) => [
      {
        id: `demo-sent-${Date.now()}`,
        senderId: DEMO_ME_ID,
        recipientId: input.recipientId,
        category: input.category,
        subject: input.subject.trim() || null,
        body: input.body.trim(),
        createdAt: nowIso,
        lastMessageAt: nowIso,
        isUnreadForMe: false,
        isSeenByPartner: false,
        partnerReadAt: null,
        isPinned: false,
        isMine: true,
      },
      ...prev,
    ]);
  }, []);

  const closeThread = () => {
    setSelectedThreadId(null);
    setDirectThread(null);
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
  };
  useDrillDown(selectedThreadId !== null, closeThread);
  const openThread = (id: string) => navTransition("forward", () => setSelectedThreadId(id));

  if (authLoading) return <PageSkeleton cards={3} />;

  if (isDemo) {
    const visibleDemoThreads = [...demoThreads].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    const selectedDemoThread = demoThreads.find((t) => t.id === selectedThreadId) ?? null;

    return (
      <div className="flex flex-col gap-4">
        {!selectedDemoThread && (
          <>
            <NotesHeader
              onCompose={() => setComposeOpen(true)}
              onMarkAllRead={() => void demoMarkAllRead()}
              hasUnread={demoThreads.some((t) => t.isUnreadForMe)}
            />
            <DemoNotice />
          </>
        )}

        {selectedDemoThread ? (
          <NoteThreadView
            thread={selectedDemoThread}
            partnerLabel={DEMO_PARTNER_LABEL}
            onBack={() => navTransition("back", () => setSelectedThreadId(null))}
            onChanged={() => {}}
            fetchMessages={demoFetchMessages}
            onMarkRead={demoMarkRead}
            onMarkUnread={demoMarkUnread}
            onTogglePin={demoTogglePin}
            onDelete={demoDelete}
            onReply={demoReply}
            onRemind={async () => true}
          />
        ) : (
            <NoteThreadList
              threads={visibleDemoThreads}
              loading={false}
              error={false}
              partnerLabel={DEMO_PARTNER_LABEL}
              onOpen={openThread}
              onTogglePin={demoTogglePin}
              onMarkRead={demoMarkRead}
              onMarkUnread={demoMarkUnread}
              onDelete={demoDelete}
              pinnedCollapsed={pinnedCollapsed}
              onPinnedCollapsedChange={setPinnedCollapsed}
              onChanged={() => {}}
            />
        )}

        <ComposeNoteDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          partnerLabel={DEMO_PARTNER_LABEL}
          partnerId={DEMO_PARTNER_ID}
          onSend={demoSend}
          onSent={() => {}}
        />
      </div>
    );
  }

  if (partnerState === "loading") return <PageSkeleton cards={3} />;

  if (partnerState === "unlinked" || !partnerLink) {
    return <PartnerLinkPanel onLinked={() => void loadPartner()} />;
  }

  const selectedThread =
    threads.find((t) => t.id === selectedThreadId) ?? (directThread?.id === selectedThreadId ? directThread : null);
  const partnerLabel = PARTNER_LABEL;

  return (
    <div className="flex flex-col gap-4">
      {!selectedThread && (
        <NotesHeader
          onCompose={() => setComposeOpen(true)}
          onMarkAllRead={() => void handleMarkAllRead()}
          hasUnread={threads.some((t) => t.isUnreadForMe)}
        />
      )}

      {selectedThread ? (
        <NoteThreadView
          thread={selectedThread}
          partnerLabel={partnerLabel}
          onBack={() => navTransition("back", closeThread)}
          onChanged={() => void loadThreads()}
          fetchMessages={fetchThreadMessages}
          onMarkRead={markRead}
          onMarkUnread={markUnread}
          onTogglePin={togglePin}
          onDelete={removeThread}
          onReply={reply}
          onRemind={remindPartner}
        />
      ) : (
          <NoteThreadList
            threads={threads}
            loading={threadsLoading}
            error={threadsError}
            partnerLabel={partnerLabel}
            onOpen={openThread}
            onTogglePin={togglePin}
            onMarkRead={markRead}
            onMarkUnread={markUnread}
            onDelete={removeThread}
            pinnedCollapsed={pinnedCollapsed}
            onPinnedCollapsedChange={setPinnedCollapsed}
            onChanged={() => void loadThreads()}
          />
      )}

      <ComposeNoteDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        partnerLabel={partnerLabel}
        partnerId={partnerLink.partnerId}
        onSend={send}
        onSent={() => void loadThreads()}
      />
    </div>
  );
}

function NotesHeader({
  onCompose,
  onMarkAllRead,
  hasUnread,
}: {
  onCompose: () => void;
  onMarkAllRead: () => void;
  /** "Mark all as read" only shows when something is unread, as in Mail. */
  hasUnread: boolean;
}) {
  return (
    <PageHeading
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <PrimaryAction label="New message" round accent={ACCENT} onClick={onCompose} />
          {hasUnread && <MoreMenu label="Message actions" items={[{ label: "Mark all as read", onClick: onMarkAllRead }]} />}
        </div>
      }
    >
      Messages
    </PageHeading>
  );
}
