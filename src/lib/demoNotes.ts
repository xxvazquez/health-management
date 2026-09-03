import type { NoteMessage, NoteThread } from "@/lib/supabase/notes";

/** Example data for the Notes page when signed out — same idea as
 * demoData.ts's buildDemoDataset for Log/Food/Workout/etc., just scoped to
 * this one page instead of the whole app, since Notes isn't part of the
 * shared DataContext (it has no offline/local-only mode at all — see
 * notes.ts's own comment on why). "Me" is a fixed fake id; "partner" is
 * the other fixed fake id — every demo thread is between exactly those
 * two, mirroring how a real linked pair only ever has one partner. */
export const DEMO_ME_ID = "demo-me";
export const DEMO_PARTNER_ID = "demo-partner";
export const DEMO_PARTNER_LABEL = "your partner";

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const iso = (msAgo: number) => new Date(now() - msAgo).toISOString();

export function buildDemoThreads(): NoteThread[] {
  return [
    {
      id: "demo-1",
      senderId: DEMO_PARTNER_ID,
      recipientId: DEMO_ME_ID,
      category: "appreciation",
      subject: "Dinner tonight",
      body: "Thank you for cooking again, it really meant a lot after the day I had 💛",
      createdAt: iso(2 * 60 * 60 * 1000),
      lastMessageAt: iso(2 * 60 * 60 * 1000),
      isUnreadForMe: true,
      isFavouritedByMe: false,
      isArchivedByMe: false,
      isMine: false,
    },
    {
      id: "demo-2",
      senderId: DEMO_ME_ID,
      recipientId: DEMO_PARTNER_ID,
      category: "reminder",
      subject: "Bins",
      body: "Bins go out tonight, not tomorrow — collection day changed this week.",
      createdAt: iso(1 * DAY),
      lastMessageAt: iso(20 * 60 * 60 * 1000),
      isUnreadForMe: false,
      isFavouritedByMe: false,
      isArchivedByMe: false,
      isMine: true,
    },
    {
      id: "demo-3",
      senderId: DEMO_PARTNER_ID,
      recipientId: DEMO_ME_ID,
      category: "question",
      subject: null,
      body: "Are we still on for the in-laws on Sunday, or did that move?",
      createdAt: iso(3 * DAY),
      lastMessageAt: iso(3 * DAY),
      isUnreadForMe: false,
      isFavouritedByMe: true,
      isArchivedByMe: false,
      isMine: false,
    },
    {
      id: "demo-4",
      senderId: DEMO_ME_ID,
      recipientId: DEMO_PARTNER_ID,
      category: "note",
      subject: "Old gym schedule",
      body: "Keeping this out of the way — we don't need it anymore.",
      createdAt: iso(20 * DAY),
      lastMessageAt: iso(20 * DAY),
      isUnreadForMe: false,
      isFavouritedByMe: false,
      isArchivedByMe: true,
      isMine: true,
    },
  ];
}

export function buildDemoMessages(rootId: string, threads: NoteThread[]): NoteMessage[] {
  const root = threads.find((t) => t.id === rootId);
  if (!root) return [];
  const rootMessage: NoteMessage = { id: root.id, senderId: root.senderId, isMine: root.isMine, body: root.body, createdAt: root.createdAt };
  if (rootId !== "demo-2") return [rootMessage];
  // demo-2 is the one example thread with a reply, so the demo shows what
  // a threaded conversation looks like, not just single messages.
  return [
    rootMessage,
    {
      id: "demo-2-reply",
      senderId: DEMO_PARTNER_ID,
      isMine: false,
      body: "Got it, thanks for the heads up!",
      createdAt: iso(20 * 60 * 60 * 1000),
    },
  ];
}
