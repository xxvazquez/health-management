import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";

export interface JournalEntry {
  id: string;
  date: string;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface JournalRow {
  id: string;
  date: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

function toEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

const ENTRY_COLUMNS = "id, date, title, body, created_at, updated_at";
const TABLE = "journal_entries";

/** Every entry for the signed-in user, most recent date first — small
 * enough at this app's scale (a personal journal, not a shared inbox) to
 * fetch in one call and let the UI handle search/sort/selection locally. */
export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select(ENTRY_COLUMNS)
    .eq("user_id", myUserId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as JournalRow[]).map(toEntry);
}

export interface NewJournalEntryInput {
  date: string;
  title: string;
  body: string;
}

/** Creates an entry, or — offline / mid-outage — queues it and returns
 * the same row immediately; see directWrite.ts. The id is generated here
 * (not by the database) so the local record and the eventual synced row
 * are always the same one. */
export async function createJournalEntry(input: NewJournalEntryInput): Promise<JournalEntry> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const nowIso = new Date().toISOString();
  const row: JournalRow = {
    id: createTimeOrderedId(),
    date: input.date,
    title: input.title.trim() || null,
    body: input.body.trim(),
    created_at: nowIso,
    updated_at: nowIso,
  };
  await upsertDirect(myUserId, TABLE, row.id, { ...row, user_id: myUserId });
  return toEntry(row);
}

export interface JournalEntryPatch {
  date?: string;
  title?: string;
  body?: string;
}

/** Updates an entry. Takes the full current entry (not just the id) so an
 * offline save can still upsert a complete row — a bare column patch
 * can't stand in for a row that may not have reached Supabase yet. */
export async function updateJournalEntry(entry: JournalEntry, patch: JournalEntryPatch): Promise<JournalEntry> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: JournalRow = {
    id: entry.id,
    date: patch.date ?? entry.date,
    title: patch.title !== undefined ? patch.title.trim() || null : entry.title,
    body: patch.body !== undefined ? patch.body.trim() : entry.body,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
  };
  await upsertDirect(myUserId, TABLE, row.id, { ...row, user_id: myUserId });
  return toEntry(row);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, TABLE, id);
}
