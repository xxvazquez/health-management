import { supabase } from "./client";
import { upsertDirect } from "./directWrite";

/** One day's mood and energy check-in, each 1 (low) – 5 (high). One row
 * per user and date — `date` is the natural key. */
export interface CheckIn {
  date: string;
  mood: number | null;
  energy: number | null;
  note: string;
}

const TABLE = "checkins";

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function scale(v: unknown): number | null {
  return typeof v === "number" && v >= 1 && v <= 5 ? v : null;
}

export async function fetchCheckIns(): Promise<CheckIn[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(TABLE).select("date, mood, energy, note").eq("user_id", myUserId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.date as string,
    mood: scale(r.mood),
    energy: scale(r.energy),
    note: (r.note as string | null) ?? "",
  }));
}

/** Saves the whole day's check-in, upserted as one row so changing one
 * field never drops another. Offline it queues; see directWrite.ts. */
export async function saveCheckIn(checkIn: CheckIn): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, TABLE, checkIn.date, {
    user_id: myUserId,
    date: checkIn.date,
    mood: checkIn.mood,
    energy: checkIn.energy,
    note: checkIn.note.trim() || null,
    updated_at: new Date().toISOString(),
  });
}
