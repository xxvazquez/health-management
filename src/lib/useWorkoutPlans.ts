"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { deleteWorkoutPlan, fetchWorkoutPlans, saveWorkoutPlan, WORKOUT_PLANS_TABLE } from "@/lib/supabase/workoutPlans";
import { useSnapshotCache } from "@/lib/useSnapshotCache";
import { demoItemIdentity } from "@/lib/demoData";
import { todayISO } from "@/components/ui/pickers/dateUtils";
import { mondayOf, type WorkoutPlan } from "@/lib/workoutPlans";

/** Module-level cache so the Log page and Settings share one plans state
 * across client-side navigation — same pattern as useMeals / useVitals. */
let cache: { userId: string; plans: WorkoutPlan[] } | null = null;

const PLAN_TABLES = [WORKOUT_PLANS_TABLE] as const;
const NO_PLANS: WorkoutPlan[] = [];

/** Demo mode's sample plan: Monday is a light 80% day for both lifts,
 * Wednesday heavy squat, Friday medium for both. */
function buildDemoPlans(): WorkoutPlan[] {
  const start = mondayOf(todayISO());
  const squat = demoItemIdentity("Squat");
  const bench = demoItemIdentity("Bench Press");
  return [
    {
      id: "demo-plan-1",
      name: "Squat & bench",
      startDate: start,
      weeks: 8,
      weeklyGainKg: 2.5,
      holdOnMiss: true,
      isActive: true,
      lifts: [
        { itemId: squat, baseKg: 90 },
        { itemId: bench, baseKg: 55 },
      ],
      sessions: [
        { weekday: 1, itemId: squat, mode: "percent", amount: 80 },
        { weekday: 1, itemId: bench, mode: "percent", amount: 80 },
        { weekday: 3, itemId: squat, mode: "kg", amount: 10 },
        { weekday: 5, itemId: squat, mode: "kg", amount: 5 },
        { weekday: 5, itemId: bench, mode: "kg", amount: 5 },
      ],
      createdDate: start,
    },
  ];
}

export function useWorkoutPlans() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  // Starts on the demo plan like useMeals does; a signed-in user's own
  // plans replace it on the first snapshot/fetch, and `loading` hides it
  // until then.
  const [plans, setPlans] = useState<WorkoutPlan[]>(() => seed?.plans ?? buildDemoPlans());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ plans: WorkoutPlan[] }>({
    feature: "workout-plans",
    tables: PLAN_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => ({ plans: await fetchWorkoutPlans() }),
    apply: ({ plans: p }) => {
      if (!Array.isArray(p)) throw new Error("bad workout-plans snapshot");
      setPlans(p);
      setError(false);
    },
    onSettled: () => setLoading(false),
    onError: () => setError(true),
  });

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) {
      cache = { userId, plans };
      persist({ plans });
    }
  }, [userId, isDemo, loading, plans, persist]);

  const save = useCallback(
    async (plan: WorkoutPlan) => {
      setPlans((prev) => {
        const rest = prev.filter((p) => p.id !== plan.id);
        return [...rest, plan].sort((a, b) => a.startDate.localeCompare(b.startDate));
      });
      if (!isDemo) await saveWorkoutPlan(plan);
    },
    [isDemo],
  );

  const remove = useCallback(
    async (id: string) => {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      if (!isDemo) await deleteWorkoutPlan(id);
    },
    [isDemo],
  );

  // Never let the demo seed show for a signed-in user whose plans haven't
  // arrived (still loading, or offline with nothing cached).
  const visible = !isDemo && (loading || error) ? NO_PLANS : plans;
  return { plans: visible, loading: loading && !isDemo, error, isDemo, save, remove };
}
