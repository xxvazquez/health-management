"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchMeals, setMealNote as setMealNoteRemote, type MealNote } from "@/lib/supabase/meals";
import { buildDemoMeals } from "@/lib/demoMeals";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Module-level cache so every Log-page visit shares one meals state
 * across client-side navigation — same pattern as useVitals / useLabs. */
let cache: { userId: string; meals: MealNote[] } | null = null;

const MEALS_TABLES = ["meals"] as const;

/** The note attached to each (date, meal tag) occurrence — grouped-meal
 * notes, not per-ingredient ones. Keyed the same way the row is: there's
 * no id, just the natural key. */
export function useMeals() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [meals, setMeals] = useState<MealNote[]>(() => seed?.meals ?? buildDemoMeals());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ meals: MealNote[] }>({
    feature: "meals",
    tables: MEALS_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => ({ meals: await fetchMeals() }),
    apply: ({ meals: m }) => {
      setMeals(m);
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
      cache = { userId, meals };
      persist({ meals });
    }
  }, [userId, isDemo, loading, meals, persist]);

  const noteFor = useCallback((date: string, mealTag: string) => meals.find((m) => m.date === date && m.mealTag === mealTag)?.note ?? "", [meals]);

  const setNote = useCallback(
    async (date: string, mealTag: string, note: string) => {
      if (isDemo) {
        setMeals((prev) => {
          const rest = prev.filter((m) => !(m.date === date && m.mealTag === mealTag));
          return note.trim() ? [...rest, { date, mealTag, note: note.trim() }] : rest;
        });
        return;
      }
      setMeals((prev) => {
        const rest = prev.filter((m) => !(m.date === date && m.mealTag === mealTag));
        return note.trim() ? [...rest, { date, mealTag, note: note.trim() }] : rest;
      });
      await setMealNoteRemote(date, mealTag, note);
    },
    [isDemo],
  );

  return { meals, loading, error, noteFor, setNote };
}
