"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchCheckIns, saveCheckIn, type CheckIn } from "@/lib/supabase/checkins";
import { buildDemoCheckIns } from "@/lib/demoCheckIns";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Module-level cache so Log and Trends share one state across client-side
 * navigation — same pattern as useMeals. */
let cache: { userId: string; checkIns: CheckIn[] } | null = null;

const CHECKIN_TABLES = ["checkins"] as const;

/** The daily mood and energy check-ins. */
export function useCheckIns() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => seed?.checkIns ?? buildDemoCheckIns());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ checkIns: CheckIn[] }>({
    feature: "checkins",
    tables: CHECKIN_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => ({ checkIns: await fetchCheckIns() }),
    apply: ({ checkIns: c }) => {
      setCheckIns(c);
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
      cache = { userId, checkIns };
      persist({ checkIns });
    }
  }, [userId, isDemo, loading, checkIns, persist]);

  const forDate = useCallback((date: string) => checkIns.find((c) => c.date === date) ?? null, [checkIns]);

  const save = useCallback(
    async (date: string, patch: Partial<Omit<CheckIn, "date">>) => {
      const current = checkIns.find((c) => c.date === date);
      const next: CheckIn = { date, mood: current?.mood ?? null, energy: current?.energy ?? null, note: current?.note ?? "", ...patch };
      setCheckIns((prev) => [...prev.filter((c) => c.date !== date), next]);
      if (!isDemo) await saveCheckIn(next);
    },
    [isDemo, checkIns],
  );

  return { checkIns, loading, error, isDemo, forDate, save };
}
