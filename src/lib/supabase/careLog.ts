import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, deleteWhereDirect, insertDirect, upsertDirect } from "./directWrite";
import type { DriveAttachment } from "@/lib/googleDrive/api";

export type { DriveAttachment };
export type CareEntryKind = "observation" | "note" | "decision";

export interface CareEntry {
  id: string;
  /** Local date the thing happened / was noted, YYYY-MM-DD. */
  happenedOn: string;
  kind: CareEntryKind;
  title: string;
  body: string | null;
  /** Optional date to be reminded to revisit this entry, YYYY-MM-DD. */
  remindOn: string | null;
  /** `decision` entries only — the supplement_items row this decision
   * explains ("why this dose"), or null. */
  supplementItemId: string | null;
  /** IDs into doctor_specialties — the specialties this entry concerns. */
  specialtyIds: string[];
  /** Google Drive files linked to this entry (pointers, not copies). */
  attachments: DriveAttachment[];
  createdAt: string;
}

interface CareEntryRow {
  id: string;
  happened_on: string;
  kind: CareEntryKind;
  title: string;
  body: string | null;
  remind_on: string | null;
  supplement_item_id: string | null;
  created_at: string;
  care_entry_specialties: { specialty_id: string }[] | null;
  care_entry_files: { drive_file_id: string; name: string; mime_type: string | null; web_view_link: string | null; icon_link: string | null }[] | null;
}

const ENTRY_COLUMNS =
  "id, happened_on, kind, title, body, remind_on, supplement_item_id, created_at, care_entry_specialties(specialty_id), care_entry_files(drive_file_id, name, mime_type, web_view_link, icon_link)";

function toEntry(row: CareEntryRow): CareEntry {
  return {
    id: row.id,
    happenedOn: row.happened_on,
    kind: row.kind,
    title: row.title,
    body: row.body,
    remindOn: row.remind_on,
    supplementItemId: row.supplement_item_id,
    specialtyIds: (row.care_entry_specialties ?? []).map((s) => s.specialty_id),
    attachments: (row.care_entry_files ?? []).map((f) => ({
      driveFileId: f.drive_file_id,
      name: f.name,
      mimeType: f.mime_type,
      webViewLink: f.web_view_link,
      iconLink: f.icon_link,
    })),
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
  remindOn: string | null;
  supplementItemId: string | null;
  specialtyIds: string[];
  attachments: DriveAttachment[];
}

const ENTRIES_TABLE = "care_entries";
const SPECIALTIES_TABLE = "care_entry_specialties";
const FILES_TABLE = "care_entry_files";

function entryPayload(e: CareEntry, userId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: e.id,
    user_id: userId,
    happened_on: e.happenedOn,
    kind: e.kind,
    title: e.title.trim(),
    body: e.body,
    remind_on: e.remindOn,
    supplement_item_id: e.kind === "decision" ? e.supplementItemId : null,
    created_at: e.createdAt,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

// care_entry_specialties has no surrogate id — its natural key is
// (entry_id, specialty_id). A tag is write-once, so insert/delete it by
// that key; the two agree on the outbox dedupe key (see directWrite).
async function addTag(userId: string, entryId: string, specialtyId: string): Promise<void> {
  const match = { entry_id: entryId, specialty_id: specialtyId };
  await insertDirect(userId, SPECIALTIES_TABLE, match, { user_id: userId, ...match });
}

async function removeTag(userId: string, entryId: string, specialtyId: string): Promise<void> {
  await deleteWhereDirect(userId, SPECIALTIES_TABLE, { entry_id: entryId, specialty_id: specialtyId });
}

// care_entry_files: natural key (entry_id, drive_file_id), write-once —
// same insert/delete-by-key pattern as the specialty tags above.
async function addFile(userId: string, entryId: string, file: DriveAttachment): Promise<void> {
  await insertDirect(
    userId,
    FILES_TABLE,
    { entry_id: entryId, drive_file_id: file.driveFileId },
    {
      user_id: userId,
      entry_id: entryId,
      drive_file_id: file.driveFileId,
      name: file.name,
      mime_type: file.mimeType,
      web_view_link: file.webViewLink,
      icon_link: file.iconLink,
    },
  );
}

async function removeFile(userId: string, entryId: string, driveFileId: string): Promise<void> {
  await deleteWhereDirect(userId, FILES_TABLE, { entry_id: entryId, drive_file_id: driveFileId });
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
    remindOn: input.remindOn,
    supplementItemId: input.kind === "decision" ? input.supplementItemId : null,
    specialtyIds: input.specialtyIds,
    attachments: input.attachments,
    createdAt: new Date().toISOString(),
  };
  await upsertDirect(myUserId, ENTRIES_TABLE, entry.id, entryPayload(entry, myUserId));
  for (const sid of input.specialtyIds) await addTag(myUserId, entry.id, sid);
  for (const file of input.attachments) await addFile(myUserId, entry.id, file);
  return entry;
}

export interface CareEntryPatch {
  happenedOn?: string;
  kind?: CareEntryKind;
  title?: string;
  body?: string;
  remindOn?: string | null;
  supplementItemId?: string | null;
  specialtyIds?: string[];
  attachments?: DriveAttachment[];
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
    remindOn: patch.remindOn !== undefined ? patch.remindOn : entry.remindOn,
    supplementItemId: patch.supplementItemId !== undefined ? patch.supplementItemId : entry.supplementItemId,
    specialtyIds: patch.specialtyIds ?? entry.specialtyIds,
    attachments: patch.attachments ?? entry.attachments,
  };
  // A changed reminder date re-arms the cron (clears the once-only guard).
  const remindChanged = patch.remindOn !== undefined && patch.remindOn !== entry.remindOn;
  await upsertDirect(myUserId, ENTRIES_TABLE, next.id, entryPayload(next, myUserId, remindChanged ? { reminder_sent_at: null } : undefined));
  if (patch.specialtyIds !== undefined) {
    for (const sid of entry.specialtyIds.filter((s) => !patch.specialtyIds!.includes(s))) await removeTag(myUserId, entry.id, sid);
    for (const sid of patch.specialtyIds.filter((s) => !entry.specialtyIds.includes(s))) await addTag(myUserId, entry.id, sid);
  }
  if (patch.attachments !== undefined) {
    const nextIds = new Set(patch.attachments.map((f) => f.driveFileId));
    const prevIds = new Set(entry.attachments.map((f) => f.driveFileId));
    for (const f of entry.attachments.filter((f) => !nextIds.has(f.driveFileId))) await removeFile(myUserId, entry.id, f.driveFileId);
    for (const f of patch.attachments.filter((f) => !prevIds.has(f.driveFileId))) await addFile(myUserId, entry.id, f);
  }
  return next;
}

export async function deleteCareEntry(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  // care_entry_specialties / care_entry_files rows cascade on the entry delete.
  await deleteDirect(myUserId, ENTRIES_TABLE, id);
}
