"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  clearFoodNutritionGroupOverride,
  fetchFoodNutritionGroupOverrides,
  setFoodNutritionGroupOverride,
} from "@/lib/supabase/foodNutritionGroups";
import { normalizeName } from "@/taxonomy/normalizeName";
import type { NutritionGroupId } from "@/taxonomy/nutritionGroups";

/** Module-level cache so the Manage page and the Food dashboard share one
 * fetch and see each other's edits without a reload — same pattern as
 * useVitals / useLabs. Keyed by user id, cleared on sign-out. */
let cache: { userId: string; overrides: Record<string, NutritionGroupId> } | null = null;

export function useFoodNutritionGroupOverrides() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache.overrides : null;

  const [overrides, setOverrides] = useState<Record<string, NutritionGroupId>>(seed ?? {});
  const [loading, setLoading] = useState(seed === null && !isDemo);

  const load = useCallback(async () => {
    try {
      const result = await fetchFoodNutritionGroupOverrides();
      setOverrides(result);
    } catch (err) {
      console.error("useFoodNutritionGroupOverrides load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) cache = { userId, overrides };
  }, [userId, isDemo, loading, overrides]);

  useEffect(() => {
    if (authLoading || isDemo) return;
    // External read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [authLoading, isDemo, userId, load]);

  const setOverride = useCallback(async (item: string, groupId: NutritionGroupId) => {
    await setFoodNutritionGroupOverride(item, groupId);
    setOverrides((prev) => ({ ...prev, [normalizeName(item)]: groupId }));
  }, []);

  const clearOverride = useCallback(async (item: string) => {
    await clearFoodNutritionGroupOverride(item);
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[normalizeName(item)];
      return next;
    });
  }, []);

  return { overrides, loading, setOverride, clearOverride };
}
