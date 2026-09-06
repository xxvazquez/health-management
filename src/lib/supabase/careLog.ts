import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, deleteWhereDirect, upsertDirect } from "./directWrite";

export type CareEntryKind = "observation" | "note";

export interface CareEntry {
  id: string;
  /** Local date the thing happened / was noted, YYYY-MM-DD. */
  happenedOn: string;
  kind: CareEntryKind;
  title: string;
  body: string | null;
  /** IDs into doctor_specialties — the specialties this entry concerns. */
  specialtyIds: string[];
  createdAt: string;
}

interface CareEntryRow {
  id: string;
  happened_on: string;
  kind: CareEntryKind;
  title: string;
  body: string | null;
  created_at: string;
  care_entry_specialties: { specialty_id: string }[] | null;
}

const ENTRY_COLUMNS = "id, happened_on, kind, title, body, created_at, care_entry_specialties(specialty_id)";

function toEntry(row: CareEntryRow): CareEntry {
  return {
    id: row.id,
    happenedOn: row.happened_on,
    kind: row.kind,
    title: row.title,
    body: row.body,
    specialtyIds: (row.care_entry_specialties ?? []).map((s) => s.specialty_id),
    createdAt: row.created_at,
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchCareEntries(): Promise<CareEntry[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("care_entries")
    .select(ENTRY_COLUMNS)
    .eq("user_id", myUserId)
    .order("happened_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CareEntryRow[]).map(toEntry);
}

export interface NewCareEntryInput {
  happenedOn: string;
  kind: CareEntryKind;
  title: string;
  body: string;
  specialtyIds: string[];
}

const ENTRIES_TABLE = "care_entries";
const SPECIALTIES_TABLE = "care_entry_specialties";

function entryPayload(e: CareEntry, userId: string): Record<string, unknown> {
  return {
    id: e.id,
    user_id: userId,
    happened_on: e.happenedOn,
    kind: e.kind,
    title: e.title.trim(),
    body: e.body,
    created_at: e.createdAt,
    updated_at: new Date().toISOString(),
  };
}

/** care_entry_specialties has no surrogate id — its natural key is
 * `(entry_id, specialty_id)`. The dedupe id doubles as that key so an
 * offline add-then-remove of the same tag cancels. */
function tagKey(entryId: string, specialtyId: string): string {
  return `entry_id=${entryId}&specialty_id=${specialtyId}`;
}

async function addTag(userId: string, entryId: string, specialtyId: string): Promise<void> {
  await upsertDirect(userId, SPECIALTIES_TABLE, tagKey(entryId, specialtyId), { user_id: userId, entry_id: entryId, specialty_id: specialtyId });
}

async function removeTag(userId: string, entryId: string, specialtyId: string): Promise<void> {
  await deleteWhereDirect(userId, SPECIALTIES_TABLE, { entry_id: entryId, specialty_id: specialtyId });
}

export async function createCareEntry(input: NewCareEntryInput): Promise<CareEntry> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const entry: CareEntry = {
    id: createTimeOrderedId(),
    happenedOn: input.happenedOn,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim() || null,
    specialtyIds: input.specialtyIds,
    createdAt: new Date().toISOString(),
  };
  await upsertDirect(myUserId, ENTRIES_TABLE, entry.id, entryPayload(entry, myUserId));
  for (const sid of input.specialtyIds) await addTag(myUserId, entry.id, sid);
  return entry;
}

export interface CareEntryPatch {
  happenedOn?: string;
  kind?: CareEntryKind;
  title?: string;
  body?: string;
  specialtyIds?: string[];
}

/** Takes the full current entry so the edit upserts a complete row and can
 * diff its specialty tags. */
export async function updateCareEntry(entry: CareEntry, patch: CareEntryPatch): Promise<CareEntry> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: CareEntry = {
    ...entry,
    happenedOn: patch.happenedOn ?? entry.happenedOn,
    kind: patch.kind ?? entry.kind,
    title: patch.title !== undefined ? patch.title.trim() : entry.title,
    body: patch.body !== undefined ? patch.body.trim() || null : entry.body,
    specialtyIds: patch.specialtyIds ?? entry.specialtyIds,
  };
  await upsertDirect(myUserId, ENTRIES_TABLE, next.id, entryPayload(next, myUserId));
  if (patch.specialtyIds !== undefined) {
    for (const sid of entry.specialtyIds.filter((s) => !patch.specialtyIds!.includes(s))) await removeTag(myUserId, entry.id, sid);
    for (const sid of patch.specialtyIds.filter((s) => !entry.specialtyIds.includes(s))) await addTag(myUserId, entry.id, sid);
  }
  return next;
}

export async function deleteCareEntry(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  // care_entry_specialties rows cascade on the entry delete.
  await deleteDirect(myUserId, ENTRIES_TABLE, id);
}
