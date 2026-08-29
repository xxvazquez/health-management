import { supabase, supabaseConfigured } from "./client";

/** Same "is cloud set up" flag as auth/sync/bug-reporting. Notes has no
 * offline/local-only mode (unlike Log's IndexedDB-backed personal
 * logging) — a note only means anything once it reaches your partner's
 * account, so there's nothing meaningful to do here without the cloud. */
export const notesConfigured = supabaseConfigured;

export const NOTE_CATEGORIES = ["note", "reminder", "appreciation", "question"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

// User-facing labels for the four message categories. The DB stores the
// keys ("note", …) unchanged — only the display text moved off "Note" when
// the feature became "Messages".
export const NOTE_CATEGORY_LABEL: Record<NoteCategory, string> = {
  note: "General",
  reminder: "Reminder",
  appreciation: "Appreciation",
  question: "Question",
};

export type NoteView = "inbox" | "sent" | "favourites" | "archived";

/** One row per top-level note (`thread_root_id is null`) — the unit the
 * Notes page's four lists are built from. Replies live under it (see
 * `fetchThreadMessages`) but never appear as their own list entry; a
 * thread's read/favourite/archive state always reflects the *root's* own
 * columns, resolved to "mine" vs "theirs" via `isMine` here so nothing
 * downstream has to know which of sender/recipient the viewer is. */
export interface NoteThread {
  id: string;
  senderId: string;
  recipientId: string;
  category: NoteCategory;
  subject: string | null;
  /** The root note's own body — the thread's opening message, not
   * whatever was said most recently (see this file's own note on why a
   * "latest reply preview" was deliberately left out). */
  body: string;
  createdAt: string;
  /** Root or reply, whichever happened most recently — what the four
   * lists sort by. */
  lastMessageAt: string;
  isUnreadForMe: boolean;
  /** Shared between both partners — either can star or unstar a thread and
   * it shows under Favourites for both. (Archive stays per-side.) */
  isFavouritedByMe: boolean;
  isArchivedByMe: boolean;
  /** Did *I* send the root note — i.e. is this "my" note from Sent, or one
   * I received into Inbox. Favourites/Archived cut across both. */
  isMine: boolean;
}

export interface NoteMessage {
  id: string;
  senderId: string;
  isMine: boolean;
  body: string;
  createdAt: string;
}

interface NoteRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  thread_root_id: string | null;
  category: string;
  subject: string | null;
  body: string;
  created_at: string;
  last_message_at: string;
  sender_read_at: string | null;
  recipient_read_at: string | null;
  sender_favourited: boolean;
  recipient_favourited: boolean;
  sender_archived: boolean;
  recipient_archived: boolean;
}

/** The Nav sidebar's unread badge lives in a completely different
 * component tree from wherever a note actually gets marked read/unread
 * (the Notes page, or its "mark all as read" bulk action) — it has its own
 * poll timer and only otherwise refetches on a route change, so without
 * this a bulk mark-as-read looked "stuck" at the old count until the next
 * 60s tick or navigation. Same-tab only (a plain DOM event, not a
 * Supabase realtime channel) — the *other* person's badge in their own
 * browser still just waits for their own poll/route-change, same as before. */
const NOTES_CHANGED_EVENT = "lauva:notes-changed";

function notifyNotesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
}

/** Subscribes to the event above; returns an unsubscribe function. */
export function onNotesChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NOTES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTES_CHANGED_EVENT, handler);
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function toThread(row: NoteRow, myUserId: string): NoteThread {
  const isMine = row.sender_id === myUserId;
  const myReadAt = isMine ? row.sender_read_at : row.recipient_read_at;
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    category: row.category as NoteCategory,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    isUnreadForMe: !myReadAt || myReadAt < row.last_message_at,
    isFavouritedByMe: row.sender_favourited || row.recipient_favourited,
    isArchivedByMe: isMine ? row.sender_archived : row.recipient_archived,
    isMine,
  };
}

const THREAD_COLUMNS =
  "id, sender_id, recipient_id, thread_root_id, category, subject, body, created_at, last_message_at, sender_read_at, recipient_read_at, sender_favourited, recipient_favourited, sender_archived, recipient_archived";

/** The four Notes page lists. Inbox/Sent split by who sent the root note
 * (classic email semantics — a partner's reply doesn't move a thread out
 * of Sent, it just makes it unread there again); Favourites is a shared
 * thread flag (either side toggles it for both); Archived stays per-side. */
export async function fetchNoteThreads(view: NoteView): Promise<NoteThread[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];

  let query = supabase.from("notes").select(THREAD_COLUMNS).is("thread_root_id", null);
  if (view === "inbox") query = query.eq("recipient_id", myUserId).eq("recipient_archived", false);
  else if (view === "sent") query = query.eq("sender_id", myUserId).eq("sender_archived", false);
  else if (view === "favourites")
    // Shared flag — RLS already scopes this to threads I'm part of.
    query = query.or("sender_favourited.eq.true,recipient_favourited.eq.true");
  else query = query.or(`and(sender_id.eq.${myUserId},sender_archived.eq.true),and(recipient_id.eq.${myUserId},recipient_archived.eq.true)`);

  const { data, error } = await query.order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data as NoteRow[]).map((row) => toThread(row, myUserId));
}

/** One specific thread by its root id, regardless of which of the four
 * tabs it'd normally show up under — for a deep link (e.g. Overview's
 * Partner Notes preview links straight to `/notes?thread=<id>`) that has
 * to resolve a thread without knowing or caring whether it's currently in
 * Inbox, Sent, Favourites, or Archived. RLS still applies as normal (only
 * a participant's own query returns anything), so this can't leak a
 * thread that `fetchNoteThreads` wouldn't eventually surface anyway. */
export async function fetchNoteThread(id: string): Promise<NoteThread | null> {
  if (!supabase) return null;
  const myUserId = await currentUserId();
  if (!myUserId) return null;
  const { data, error } = await supabase.from("notes").select(THREAD_COLUMNS).eq("id", id).is("thread_root_id", null).maybeSingle();
  if (error) throw error;
  return data ? toThread(data as NoteRow, myUserId) : null;
}

/** For the sidebar badge. PostgREST filters compare a column against a
 * supplied value, not against another column in the same row, so "is this
 * thread unread" (read_at is null OR older than last_message_at) can't be
 * expressed as a server-side filter — this fetches the small set of
 * non-archived threads the viewer is part of and finishes the comparison
 * in JS, same as `toThread` already does for the list views. Fine at this
 * app's scale (one partner's worth of notes, not a shared inbox). */
export async function unreadNoteCount(): Promise<number> {
  if (!supabase) return 0;
  const myUserId = await currentUserId();
  if (!myUserId) return 0;
  const { data, error } = await supabase
    .from("notes")
    .select("sender_id, recipient_id, last_message_at, sender_read_at, recipient_read_at, sender_archived, recipient_archived")
    .is("thread_root_id", null)
    .or(`sender_id.eq.${myUserId},recipient_id.eq.${myUserId}`);
  if (error) throw error;
  type Row = Pick<
    NoteRow,
    "sender_id" | "recipient_id" | "last_message_at" | "sender_read_at" | "recipient_read_at" | "sender_archived" | "recipient_archived"
  >;
  return (data as Row[]).filter((row) => {
    const isMine = row.sender_id === myUserId;
    if (isMine ? row.sender_archived : row.recipient_archived) return false;
    const myReadAt = isMine ? row.sender_read_at : row.recipient_read_at;
    return !myReadAt || myReadAt < row.last_message_at;
  }).length;
}

/** Every message in one thread (the root plus every reply under it),
 * oldest first — what the thread detail view renders. */
export async function fetchThreadMessages(rootId: string): Promise<NoteMessage[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("notes")
    .select("id, sender_id, body, created_at")
    .or(`id.eq.${rootId},thread_root_id.eq.${rootId}`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as { id: string; sender_id: string; body: string; created_at: string }[]).map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    isMine: row.sender_id === myUserId,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export interface NewNoteInput {
  recipientId: string;
  category: NoteCategory;
  subject: string;
  body: string;
}

export async function sendNote(input: NewNoteInput): Promise<string> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("notes")
    .insert({
      sender_id: myUserId,
      recipient_id: input.recipientId,
      category: input.category,
      subject: input.subject.trim() || null,
      body: input.body.trim(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** A reply always keeps the root's own category — it's a response inside
 * an existing conversation, not a new one to classify. */
export async function replyToNote(rootId: string, recipientId: string, body: string): Promise<string> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("notes")
    .insert({ sender_id: myUserId, recipient_id: recipientId, thread_root_id: rootId, body: body.trim() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateMyThreadState(
  threadId: string,
  isMine: boolean,
  patch: { readAt?: string | null; favourited?: boolean; archived?: boolean },
): Promise<void> {
  if (!supabase) return;
  const update: Record<string, unknown> = {};
  if (patch.readAt !== undefined) update[isMine ? "sender_read_at" : "recipient_read_at"] = patch.readAt;
  // Favourite is a shared thread flag — write both sides so it shows under
  // Favourites for both partners and either can clear it (the RLS update
  // policy already allows either participant to write the root row).
  if (patch.favourited !== undefined) {
    update.sender_favourited = patch.favourited;
    update.recipient_favourited = patch.favourited;
  }
  if (patch.archived !== undefined) update[isMine ? "sender_archived" : "recipient_archived"] = patch.archived;
  const { error } = await supabase.from("notes").update(update).eq("id", threadId);
  if (error) throw error;
  // read/unread and archive both change what counts as unread — cheap
  // enough to fire for favourite too rather than threading a "does this
  // actually affect the badge" flag through every call site.
  notifyNotesChanged();
}

export function markThreadRead(threadId: string, isMine: boolean): Promise<void> {
  return updateMyThreadState(threadId, isMine, { readAt: new Date().toISOString() });
}
export function markThreadUnread(threadId: string, isMine: boolean): Promise<void> {
  return updateMyThreadState(threadId, isMine, { readAt: null });
}
export function setThreadFavourited(threadId: string, isMine: boolean, favourited: boolean): Promise<void> {
  return updateMyThreadState(threadId, isMine, { favourited });
}
export function setThreadArchived(threadId: string, isMine: boolean, archived: boolean): Promise<void> {
  return updateMyThreadState(threadId, isMine, { archived });
}

/** Clears unread across every thread at once — both the ones sent to the
 * caller (recipient_read_at) and any of their own that got a reply since
 * they last opened it (sender_read_at). Two bulk updates instead of one
 * because a single row can't be both "my sent thread" and "my inbox
 * thread" at once, so each column only ever needs the caller's own side. */
export async function markAllThreadsRead(): Promise<void> {
  if (!supabase) return;
  const myUserId = await currentUserId();
  if (!myUserId) return;
  const nowIso = new Date().toISOString();
  const [sent, received] = await Promise.all([
    supabase.from("notes").update({ sender_read_at: nowIso }).eq("sender_id", myUserId).is("thread_root_id", null),
    supabase.from("notes").update({ recipient_read_at: nowIso }).eq("recipient_id", myUserId).is("thread_root_id", null),
  ]);
  if (sent.error) throw sent.error;
  if (received.error) throw received.error;
  notifyNotesChanged();
}
