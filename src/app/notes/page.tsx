"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { getPartnerEmail, getPartnerLink, type PartnerLink } from "@/lib/supabase/partner";
import {
  fetchNoteThreads,
  fetchThreadMessages,
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

const VIEWS: { id: NoteView; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "favourites", label: "Favourites" },
  { id: "archived", label: "Archived" },
];

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

  const [partnerState, setPartnerState] = useState<"loading" | "unlinked" | "linked">("loading");
  const [partnerLink, setPartnerLink] = useState<PartnerLink | null>(null);
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null);

  const loadPartner = useCallback(async () => {
    setPartnerState("loading");
    try {
      const [link, email] = await Promise.all([getPartnerLink(), getPartnerEmail()]);
      setPartnerLink(link);
      setPartnerEmail(email);
      setPartnerState(link ? "linked" : "unlinked");
    } catch (err) {
      console.error("loadPartner failed", err);
      setPartnerState("unlinked");
    }
  }, []);

  useEffect(() => {
    if (!session) return;
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
        <NotesHeader partnerLabel={DEMO_PARTNER_LABEL} onCompose={() => setComposeOpen(true)} />
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

  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null;
  const partnerLabel = partnerEmail ?? "your partner";

  return (
    <div className="flex flex-col gap-4">
      <NotesHeader partnerLabel={partnerLabel} onCompose={() => setComposeOpen(true)} />

      {selectedThread ? (
        <NoteThreadView
          thread={selectedThread}
          partnerLabel={partnerLabel}
          onBack={() => setSelectedThreadId(null)}
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

function NotesHeader({ partnerLabel, onCompose }: { partnerLabel: string; onCompose: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Notes
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Private notes between you and <span style={{ color: "var(--text-primary)" }}>{partnerLabel}</span>.
        </p>
      </div>
      <button
        type="button"
        onClick={onCompose}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white"
        style={{ background: ACCENT }}
      >
        + New note
      </button>
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
