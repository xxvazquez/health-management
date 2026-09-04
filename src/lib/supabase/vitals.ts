import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";

export interface BloodPressureReading {
  id: string;
  /** ISO timestamp the reading was taken. */
  measuredAt: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  note: string | null;
}

export interface WeightReading {
  id: string;
  measuredAt: string;
  kg: number;
  note: string | null;
}

interface BpRow {
  id: string;
  measured_at: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  note: string | null;
}

interface WeightRow {
  id: string;
  measured_at: string;
  kg: number | string;
  note: string | null;
}

const BP_TABLE = "blood_pressure";
const WEIGHT_TABLE = "weight_logs";
const BP_COLUMNS = "id, measured_at, systolic, diastolic, pulse, note";
const WEIGHT_COLUMNS = "id, measured_at, kg, note";

function toBp(row: BpRow): BloodPressureReading {
  return {
    id: row.id,
    measuredAt: row.measured_at,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    note: row.note,
  };
}

function toWeight(row: WeightRow): WeightReading {
  return {
    id: row.id,
    measuredAt: row.measured_at,
    kg: typeof row.kg === "string" ? Number(row.kg) : row.kg,
    note: row.note,
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

// --- Blood pressure --------------------------------------------------

export async function fetchBloodPressure(): Promise<BloodPressureReading[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("blood_pressure")
    .select(BP_COLUMNS)
    .eq("user_id", myUserId)
    .order("measured_at", { ascending: false });
  if (error) throw error;
  return (data as BpRow[]).map(toBp);
}

export interface NewBloodPressureInput {
  measuredAt: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  note: string;
}

/** Creates a blood-pressure reading, or — offline / mid-outage — queues it
 * and returns the same row immediately; see directWrite.ts. The id is
 * generated here (not by the database) so the local record and the
 * eventual synced row are always the same one. */
export async function createBloodPressure(input: NewBloodPressureInput): Promise<BloodPressureReading> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: BpRow = { id: createTimeOrderedId(), measured_at: input.measuredAt, systolic: input.systolic, diastolic: input.diastolic, pulse: input.pulse, note: input.note.trim() || null };
  await upsertDirect(myUserId, BP_TABLE, row.id, { ...row, user_id: myUserId });
  return toBp(row);
}

/** Updates a blood-pressure reading. `created_at` is left out of the
 * payload entirely rather than guessed, so an upsert against an existing
 * row never touches it — only a genuine offline-created-then-never-synced
 * row would fall back to the column default. */
export async function updateBloodPressure(id: string, input: NewBloodPressureInput): Promise<BloodPressureReading> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: BpRow = { id, measured_at: input.measuredAt, systolic: input.systolic, diastolic: input.diastolic, pulse: input.pulse, note: input.note.trim() || null };
  await upsertDirect(myUserId, BP_TABLE, id, { ...row, user_id: myUserId, updated_at: new Date().toISOString() });
  return toBp(row);
}

export async function deleteBloodPressure(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, BP_TABLE, id);
}

// --- Weight --------------------------------------------------------

export async function fetchWeight(): Promise<WeightReading[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("weight_logs")
    .select(WEIGHT_COLUMNS)
    .eq("user_id", myUserId)
    .order("measured_at", { ascending: false });
  if (error) throw error;
  return (data as WeightRow[]).map(toWeight);
}

export interface NewWeightInput {
  measuredAt: string;
  kg: number;
  note: string;
}

/** Creates a weight reading, or — offline / mid-outage — queues it and
 * returns the same row immediately; see directWrite.ts. The id is
 * generated here (not by the database) so the local record and the
 * eventual synced row are always the same one. */
export async function createWeight(input: NewWeightInput): Promise<WeightReading> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: WeightRow = { id: createTimeOrderedId(), measured_at: input.measuredAt, kg: input.kg, note: input.note.trim() || null };
  await upsertDirect(myUserId, WEIGHT_TABLE, row.id, { ...row, user_id: myUserId });
  return toWeight(row);
}

/** Updates a weight reading. `created_at` is left out of the payload
 * entirely rather than guessed, so an upsert against an existing row
 * never touches it — only a genuine offline-created-then-never-synced row
 * would fall back to the column default. */
export async function updateWeight(id: string, input: NewWeightInput): Promise<WeightReading> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const row: WeightRow = { id, measured_at: input.measuredAt, kg: input.kg, note: input.note.trim() || null };
  await upsertDirect(myUserId, WEIGHT_TABLE, id, { ...row, user_id: myUserId, updated_at: new Date().toISOString() });
  return toWeight(row);
}

export async function deleteWeight(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, WEIGHT_TABLE, id);
}
