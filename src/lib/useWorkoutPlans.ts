"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { deleteWorkoutPlan, fetchWorkoutPlans, saveWorkoutPlan, WORKOUT_PLANS_TABLE } from "@/lib/supabase/workoutPlans";
import { useSnapshotCache } from "@/lib/useSnapshotCache";
import { buildDemoWorkoutPlans } from "@/lib/demoData";
import type { WorkoutPlan } from "@/lib/workoutPlans";

/** Module-level cache so the Log page and Settings share one plans state
 * across client-side navigation — same pattern as useMeals / useVitals. */
let cache: { userId: string; plans: WorkoutPlan[] } | null = null;

const PLAN_TABLES = [WORKOUT_PLANS_TABLE] as const;
const NO_PLANS: WorkoutPlan[] = [];

export function useWorkoutPlans() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  // Starts on the demo plan like useMeals does; a signed-in user's own
  // plans replace it on the first snapshot/fetch, and `loading` hides it
  // until then.
  const [plans, setPlans] = useState<WorkoutPlan[]>(() => seed?.plans ?? buildDemoWorkoutPlans());
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
