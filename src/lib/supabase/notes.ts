import { supabase, supabaseConfigured } from "./client";

/** Same "is cloud set up" flag as auth/sync/bug-reporting. Notes has no
 * offline/local-only mode (unlike Log's IndexedDB-backed personal
 * logging) — a note only means anything once it reaches your partner's
 * account, so there's nothing meaningful to do here without the cloud. */
export const notesConfigured = supabaseConfigured;

export const NOTE_CATEGORIES = ["note", "reminder", "appreciation", "question"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const NOTE_CATEGORY_LABEL: Record<NoteCategory, string> = {
  note: "Note",
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
    isFavouritedByMe: isMine ? row.sender_favourited : row.recipient_favourited,
    isArchivedByMe: isMine ? row.sender_archived : row.recipient_archived,
    isMine,
  };
}

const THREAD_COLUMNS =
  "id, sender_id, recipient_id, thread_root_id, category, subject, body, created_at, last_message_at, sender_read_at, recipient_read_at, sender_favourited, recipient_favourited, sender_archived, recipient_archived";

/** The four Notes page lists. Inbox/Sent split by who sent the root note
 * (classic email semantics — a partner's reply doesn't move a thread out
 * of Sent, it just makes it unread there again); Favourites/Archived cut
 * across both since either side of a thread can favourite/archive their
 * own copy of it independently. */
export async function fetchNoteThreads(view: NoteView): Promise<NoteThread[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];

  let query = supabase.from("notes").select(THREAD_COLUMNS).is("thread_root_id", null);
  if (view === "inbox") query = query.eq("recipient_id", myUserId).eq("recipient_archived", false);
  else if (view === "sent") query = query.eq("sender_id", myUserId).eq("sender_archived", false);
  else if (view === "favourites")
    query = query.or(`and(sender_id.eq.${myUserId},sender_favourited.eq.true),and(recipient_id.eq.${myUserId},recipient_favourited.eq.true)`);
  else query = query.or(`and(sender_id.eq.${myUserId},sender_archived.eq.true),and(recipient_id.eq.${myUserId},recipient_archived.eq.true)`);

  const { data, error } = await query.order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data as NoteRow[]).map((row) => toThread(row, myUserId));
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

/** Fire-and-forget — a slow or failed send must never block the note
 * itself (already saved by the time this runs) or surface as an error the
 * sender has to deal with; the message is there either way, they just
 * might not get emailed about it. */
async function notifyNote(noteId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.functions.invoke("notify-note", { body: { noteId } });
    if (error) console.error("notify-note failed", error);
  } catch (err) {
    console.error("notify-note failed", err);
  }
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
  void notifyNote(data.id);
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
  void notifyNote(data.id);
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
  if (patch.favourited !== undefined) update[isMine ? "sender_favourited" : "recipient_favourited"] = patch.favourited;
  if (patch.archived !== undefined) update[isMine ? "sender_archived" : "recipient_archived"] = patch.archived;
  const { error } = await supabase.from("notes").update(update).eq("id", threadId);
  if (error) throw error;
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
