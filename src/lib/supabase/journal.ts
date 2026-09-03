import { supabase } from "./client";

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

/** Every entry for the signed-in user, most recent date first — small
 * enough at this app's scale (a personal journal, not a shared inbox) to
 * fetch in one call and let the UI handle search/sort/selection locally. */
export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("journal_entries")
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

export async function createJournalEntry(input: NewJournalEntryInput): Promise<JournalEntry> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      user_id: myUserId,
      date: input.date,
      title: input.title.trim() || null,
      body: input.body.trim(),
    })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw error;
  return toEntry(data as JournalRow);
}

export interface JournalEntryPatch {
  date?: string;
  title?: string;
  body?: string;
}

export async function updateJournalEntry(id: string, patch: JournalEntryPatch): Promise<JournalEntry> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.date !== undefined) update.date = patch.date;
  if (patch.title !== undefined) update.title = patch.title.trim() || null;
  if (patch.body !== undefined) update.body = patch.body.trim();
  const { data, error } = await supabase.from("journal_entries").update(update).eq("id", id).select(ENTRY_COLUMNS).single();
  if (error) throw error;
  return toEntry(data as JournalRow);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  if (!supabase) throw new Error("Cloud sync isn't set up for this deployment.");
  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) throw error;
}
