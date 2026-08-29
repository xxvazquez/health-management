"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { getPartnerLink, type PartnerLink } from "@/lib/supabase/partner";
import {
  fetchNoteThread,
  fetchNoteThreads,
  fetchThreadMessages,
  markAllThreadsRead,
  markThreadRead,
  markThreadUnread,
  replyToNote,
  sendNote,
  setThreadArchived,
  setThreadFavourited,
  type NewNoteInput,
  type NoteMessage,
  type NoteThread,
  type NoteView,
} from "@/lib/supabase/notes";
import { buildDemoMessages, buildDemoThreads, DEMO_ME_ID, DEMO_PARTNER_ID, DEMO_PARTNER_LABEL } from "@/lib/demoNotes";
import { PartnerLinkPanel } from "@/components/notes/PartnerLinkPanel";
import { ComposeNoteDialog } from "@/components/notes/ComposeNoteDialog";
import { NoteThreadList } from "@/components/notes/NoteThreadList";
import { NoteThreadView } from "@/components/notes/NoteThreadView";

const ACCENT = "var(--series-magenta)";
// Never the partner's email — that's private data the app shouldn't surface
// as casual UI copy, so every real-account label reads generically instead.
const PARTNER_LABEL = "your partner";

const VIEWS: { id: NoteView; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "favourites", label: "Favourites" },
  { id: "archived", label: "Archived" },
];

/** Per-session cache of the resolved partner link, keyed by user id — so
 * navigating back to Notes skips the full-page loading wall. Cleared on
 * sign-out. */
let partnerLinkCache: { userId: string; link: PartnerLink | null } | null = null;

function matchesView(t: NoteThread, view: NoteView): boolean {
  if (view === "inbox") return !t.isMine && !t.isArchivedByMe;
  if (view === "sent") return t.isMine && !t.isArchivedByMe;
  if (view === "favourites") return t.isFavouritedByMe;
  return t.isArchivedByMe;
}

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

  const [view, setView] = useState<NoteView>("inbox");
  const [threads, setThreads] = useState<NoteThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  // Set only via the `?thread=` deep link (see the effect below) — a
  // thread linked from outside (Overview's Partner Notes preview) might not
  // be in whichever tab's `threads` list is currently loaded (it could be
  // Sent while Inbox is open, say), so it's fetched and held separately
  // rather than requiring it to already be in `threads`.
  const [directThread, setDirectThread] = useState<NoteThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(false);
    try {
      setThreads(await fetchNoteThreads(view));
    } catch (err) {
      console.error("fetchNoteThreads failed", err);
      setThreadsError(true);
    } finally {
      setThreadsLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (partnerState === "linked") {
      // Same reasoning as the loadPartner effect above.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadThreads();
    }
  }, [partnerState, loadThreads]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllThreadsRead();
      await loadThreads();
    } catch (err) {
      console.error("markAllThreadsRead failed", err);
    }
  }, [loadThreads]);

  // One-time deep-link resolution: `/notes?thread=<id>` opens that thread
  // directly regardless of which tab it belongs to. Only meaningful once a
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
  const demoToggleFavourite = useCallback(
    async (threadId: string, _isMine: boolean, next: boolean) => demoSetField(threadId, { isFavouritedByMe: next }),
    [demoSetField],
  );
  const demoToggleArchive = useCallback(
    async (threadId: string, _isMine: boolean, next: boolean) => demoSetField(threadId, { isArchivedByMe: next }),
    [demoSetField],
  );
  const demoReply = useCallback(async (rootId: string, _recipientId: string, body: string) => {
    const message: NoteMessage = { id: `demo-reply-${Date.now()}`, senderId: DEMO_ME_ID, isMine: true, body, createdAt: new Date().toISOString() };
    demoRepliesRef.current = { ...demoRepliesRef.current, [rootId]: [...(demoRepliesRef.current[rootId] ?? []), message] };
    demoSetField(rootId, { lastMessageAt: message.createdAt });
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
        isFavouritedByMe: false,
        isArchivedByMe: false,
        isMine: true,
      },
      ...prev,
    ]);
  }, []);

  if (authLoading) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (isDemo) {
    const visibleDemoThreads = demoThreads.filter((t) => matchesView(t, view)).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    const selectedDemoThread = demoThreads.find((t) => t.id === selectedThreadId) ?? null;

    return (
      <div className="flex flex-col gap-4">
        <NotesHeader onCompose={() => setComposeOpen(true)} onMarkAllRead={() => void demoMarkAllRead()} />
        <p className="text-xs" style={{ color: "var(--series-magenta)" }}>
          Example data — try replying, favouriting, or archiving freely below. None of this is saved anywhere; sign in to connect
          with your real partner instead.
        </p>

        {selectedDemoThread ? (
          <NoteThreadView
            thread={selectedDemoThread}
            partnerLabel={DEMO_PARTNER_LABEL}
            onBack={() => setSelectedThreadId(null)}
            onChanged={() => {}}
            fetchMessages={demoFetchMessages}
            onMarkRead={demoMarkRead}
            onMarkUnread={demoMarkUnread}
            onToggleFavourite={demoToggleFavourite}
            onToggleArchive={demoToggleArchive}
            onReply={demoReply}
          />
        ) : (
          <>
            <ViewTabs view={view} onChange={setView} />
            <NoteThreadList
              threads={visibleDemoThreads}
              loading={false}
              error={false}
              view={view}
              partnerLabel={DEMO_PARTNER_LABEL}
              onOpen={setSelectedThreadId}
              onToggleFavourite={demoToggleFavourite}
              onToggleArchive={demoToggleArchive}
              onMarkRead={demoMarkRead}
              onMarkUnread={demoMarkUnread}
              onChanged={() => {}}
            />
          </>
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

  if (partnerState === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (partnerState === "unlinked" || !partnerLink) {
    return <PartnerLinkPanel onLinked={() => void loadPartner()} />;
  }

  const selectedThread =
    threads.find((t) => t.id === selectedThreadId) ?? (directThread?.id === selectedThreadId ? directThread : null);
  const partnerLabel = PARTNER_LABEL;

  return (
    <div className="flex flex-col gap-4">
      <NotesHeader onCompose={() => setComposeOpen(true)} onMarkAllRead={() => void handleMarkAllRead()} />

      {selectedThread ? (
        <NoteThreadView
          thread={selectedThread}
          partnerLabel={partnerLabel}
          onBack={() => {
            setSelectedThreadId(null);
            setDirectThread(null);
            if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
          }}
          onChanged={() => void loadThreads()}
          fetchMessages={fetchThreadMessages}
          onMarkRead={markThreadRead}
          onMarkUnread={markThreadUnread}
          onToggleFavourite={setThreadFavourited}
          onToggleArchive={setThreadArchived}
          onReply={replyToNote}
        />
      ) : (
        <>
          <ViewTabs view={view} onChange={setView} />
          <NoteThreadList
            threads={threads}
            loading={threadsLoading}
            error={threadsError}
            view={view}
            partnerLabel={partnerLabel}
            onOpen={setSelectedThreadId}
            onToggleFavourite={setThreadFavourited}
            onToggleArchive={setThreadArchived}
            onMarkRead={markThreadRead}
            onMarkUnread={markThreadUnread}
            onChanged={() => void loadThreads()}
          />
        </>
      )}

      <ComposeNoteDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        partnerLabel={partnerLabel}
        partnerId={partnerLink.partnerId}
        onSend={sendNote}
        onSent={() => void loadThreads()}
      />
    </div>
  );
}

function NotesHeader({
  onCompose,
  onMarkAllRead,
}: {
  onCompose: () => void;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div
        className="border-l-[3px] pl-2.5"
        style={{ borderColor: ACCENT }}
      >
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Messages
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onMarkAllRead}
          className="rounded-md border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
        >
          Mark all as read
        </button>
        <button
          type="button"
          onClick={onCompose}
          className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: ACCENT }}
        >
          + New message
        </button>
      </div>
    </div>
  );
}

function ViewTabs({ view, onChange }: { view: NoteView; onChange: (v: NoteView) => void }) {
  return (
    <div className="flex gap-1 border-b" style={{ borderColor: "var(--gridline)" }}>
      {VIEWS.map((v) => {
        const active = v.id === view;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            className="border-b-2 px-3 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: active ? ACCENT : "transparent", color: active ? ACCENT : "var(--text-secondary)" }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
