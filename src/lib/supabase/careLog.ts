import { supabase, supabaseConfigured } from "./client";

/** Same "is cloud set up" flag as the rest of Doctors — a care-log entry
 * only exists once it's saved to your account, no offline/local-only mode. */
export const careLogConfigured = supabaseConfigured;

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

function notConfigured(): Error {
  return new Error("Cloud sync isn't set up for this deployment.");
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

async function replaceEntrySpecialties(userId: string, entryId: string, specialtyIds: string[]): Promise<void> {
  if (!supabase) return;
  const { error: delErr } = await supabase.from("care_entry_specialties").delete().eq("entry_id", entryId);
  if (delErr) throw delErr;
  if (specialtyIds.length === 0) return;
  const { error: insErr } = await supabase
    .from("care_entry_specialties")
    .insert(specialtyIds.map((specialty_id) => ({ user_id: userId, entry_id: entryId, specialty_id })));
  if (insErr) throw insErr;
}

export async function createCareEntry(input: NewCareEntryInput): Promise<CareEntry> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("care_entries")
    .insert({
      user_id: myUserId,
      happened_on: input.happenedOn,
      kind: input.kind,
      title: input.title.trim(),
      body: input.body.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  await replaceEntrySpecialties(myUserId, id, input.specialtyIds);
  const { data: full, error: readErr } = await supabase.from("care_entries").select(ENTRY_COLUMNS).eq("id", id).single();
  if (readErr) throw readErr;
  return toEntry(full as CareEntryRow);
}

export interface CareEntryPatch {
  happenedOn?: string;
  kind?: CareEntryKind;
  title?: string;
  body?: string;
  specialtyIds?: string[];
}

export async function updateCareEntry(id: string, patch: CareEntryPatch): Promise<CareEntry> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.happenedOn !== undefined) update.happened_on = patch.happenedOn;
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.body !== undefined) update.body = patch.body.trim() || null;
  const { error } = await supabase.from("care_entries").update(update).eq("id", id);
  if (error) throw error;
  if (patch.specialtyIds !== undefined) await replaceEntrySpecialties(myUserId, id, patch.specialtyIds);
  const { data, error: readErr } = await supabase.from("care_entries").select(ENTRY_COLUMNS).eq("id", id).single();
  if (readErr) throw readErr;
  return toEntry(data as CareEntryRow);
}

export async function deleteCareEntry(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("care_entries").delete().eq("id", id);
  if (error) throw error;
}
