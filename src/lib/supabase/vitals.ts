import { supabase } from "./client";

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

function notConfigured(): Error {
  return new Error("Cloud sync isn't set up for this deployment.");
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

export async function createBloodPressure(input: NewBloodPressureInput): Promise<BloodPressureReading> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("blood_pressure")
    .insert({
      user_id: myUserId,
      measured_at: input.measuredAt,
      systolic: input.systolic,
      diastolic: input.diastolic,
      pulse: input.pulse,
      note: input.note.trim() || null,
    })
    .select(BP_COLUMNS)
    .single();
  if (error) throw error;
  return toBp(data as BpRow);
}

export interface BloodPressurePatch {
  measuredAt?: string;
  systolic?: number;
  diastolic?: number;
  pulse?: number | null;
  note?: string;
}

export async function updateBloodPressure(id: string, patch: BloodPressurePatch): Promise<BloodPressureReading> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.measuredAt !== undefined) update.measured_at = patch.measuredAt;
  if (patch.systolic !== undefined) update.systolic = patch.systolic;
  if (patch.diastolic !== undefined) update.diastolic = patch.diastolic;
  if (patch.pulse !== undefined) update.pulse = patch.pulse;
  if (patch.note !== undefined) update.note = patch.note.trim() || null;
  const { data, error } = await supabase.from("blood_pressure").update(update).eq("id", id).select(BP_COLUMNS).single();
  if (error) throw error;
  return toBp(data as BpRow);
}

export async function deleteBloodPressure(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("blood_pressure").delete().eq("id", id);
  if (error) throw error;
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

export async function createWeight(input: NewWeightInput): Promise<WeightReading> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("weight_logs")
    .insert({ user_id: myUserId, measured_at: input.measuredAt, kg: input.kg, note: input.note.trim() || null })
    .select(WEIGHT_COLUMNS)
    .single();
  if (error) throw error;
  return toWeight(data as WeightRow);
}

export interface WeightPatch {
  measuredAt?: string;
  kg?: number;
  note?: string;
}

export async function updateWeight(id: string, patch: WeightPatch): Promise<WeightReading> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.measuredAt !== undefined) update.measured_at = patch.measuredAt;
  if (patch.kg !== undefined) update.kg = patch.kg;
  if (patch.note !== undefined) update.note = patch.note.trim() || null;
  const { data, error } = await supabase.from("weight_logs").update(update).eq("id", id).select(WEIGHT_COLUMNS).single();
  if (error) throw error;
  return toWeight(data as WeightRow);
}

export async function deleteWeight(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("weight_logs").delete().eq("id", id);
  if (error) throw error;
}
