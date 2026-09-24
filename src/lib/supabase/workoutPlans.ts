import { supabase } from "./client";
import { deleteDirect, upsertDirect } from "./directWrite";
import type { PlanAdjustMode, WorkoutPlan, WorkoutPlanLift, WorkoutPlanSession } from "@/lib/workoutPlans";

export const WORKOUT_PLANS_TABLE = "workout_plans";

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** `lifts` / `sessions` are jsonb — read defensively so one malformed entry
 * (a hand edit, an older shape) drops that entry rather than the plan. */
function parseLifts(value: unknown): WorkoutPlanLift[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((l) => (l && typeof l.itemId === "string" ? [{ itemId: l.itemId, baseKg: num(l.baseKg, 0) }] : []));
}

function parseSessions(value: unknown): WorkoutPlanSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => {
    if (!s || typeof s.itemId !== "string") return [];
    const weekday = num(s.weekday, 0);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return [];
    const mode: PlanAdjustMode = s.mode === "percent" ? "percent" : "kg";
    return [{ weekday, itemId: s.itemId, mode, amount: num(s.amount, mode === "percent" ? 100 : 0) }];
  });
}

export function planFromRow(r: Record<string, unknown>): WorkoutPlan {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "",
    startDate: r.start_date as string,
    weeks: r.weeks === null || r.weeks === undefined ? null : num(r.weeks, 0) || null,
    weeklyGainKg: num(r.weekly_gain_kg, 0),
    holdOnMiss: r.hold_on_miss !== false,
    isActive: r.is_active !== false,
    lifts: parseLifts(r.lifts),
    sessions: parseSessions(r.sessions),
    createdDate: (r.created_date as string) ?? (r.start_date as string),
  };
}

export async function fetchWorkoutPlans(): Promise<WorkoutPlan[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from(WORKOUT_PLANS_TABLE)
    .select("id, name, start_date, weeks, weekly_gain_kg, hold_on_miss, is_active, lifts, sessions, created_date")
    .eq("user_id", myUserId)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).filter((r) => r.id && r.start_date).map(planFromRow);
}

/** Creates or replaces a whole plan (the id is client-generated). Offline /
 * mid-outage it queues; see directWrite.ts. */
export async function saveWorkoutPlan(plan: WorkoutPlan): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, WORKOUT_PLANS_TABLE, plan.id, {
    id: plan.id,
    user_id: myUserId,
    name: plan.name.trim(),
    start_date: plan.startDate,
    weeks: plan.weeks,
    weekly_gain_kg: plan.weeklyGainKg,
    hold_on_miss: plan.holdOnMiss,
    is_active: plan.isActive,
    lifts: plan.lifts,
    sessions: plan.sessions,
    created_date: plan.createdDate,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteWorkoutPlan(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, WORKOUT_PLANS_TABLE, id);
}
