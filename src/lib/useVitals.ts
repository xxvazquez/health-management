"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  createBloodPressure,
  createWeight,
  deleteBloodPressure,
  deleteWeight,
  fetchBloodPressure,
  fetchWeight,
  updateBloodPressure,
  updateWeight,
  type BloodPressureReading,
  type NewBloodPressureInput,
  type NewWeightInput,
  type WeightReading,
} from "@/lib/supabase/vitals";
import { buildDemoBloodPressure, buildDemoWeight } from "@/lib/demoVitals";

/** Module-level cache so the Medical → Vitals tab and the Blood analytics
 * dashboard share one vitals state across client-side navigation — same
 * pattern as useLabs / useCareLog. Keyed by user id, cleared on sign-out. */
let cache: { userId: string; bp: BloodPressureReading[]; weight: WeightReading[] } | null = null;

function demoId(prefix: string): string {
  return `demo-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const byNewest = <T extends { measuredAt: string }>(list: T[]) =>
  [...list].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

export function useVitals() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [bp, setBp] = useState<BloodPressureReading[]>(() => seed?.bp ?? buildDemoBloodPressure());
  const [weight, setWeight] = useState<WeightReading[]>(() => seed?.weight ?? buildDemoWeight());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [b, w] = await Promise.all([fetchBloodPressure(), fetchWeight()]);
      setBp(b);
      setWeight(w);
    } catch (err) {
      console.error("useVitals load failed", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) cache = { userId, bp, weight };
  }, [userId, isDemo, loading, bp, weight]);

  useEffect(() => {
    if (authLoading || isDemo) return;
    // External read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [authLoading, isDemo, userId, load]);

  // --- Blood pressure ---
  const addBp = useCallback(
    async (input: NewBloodPressureInput) => {
      if (isDemo) {
        setBp((prev) =>
          byNewest([
            { id: demoId("bp"), measuredAt: input.measuredAt, systolic: input.systolic, diastolic: input.diastolic, pulse: input.pulse, note: input.note.trim() || null },
            ...prev,
          ]),
        );
        return;
      }
      const created = await createBloodPressure(input);
      setBp((prev) => byNewest([created, ...prev]));
    },
    [isDemo],
  );

  const editBp = useCallback(
    async (id: string, input: NewBloodPressureInput) => {
      const optimistic: BloodPressureReading = { id, measuredAt: input.measuredAt, systolic: input.systolic, diastolic: input.diastolic, pulse: input.pulse, note: input.note.trim() || null };
      setBp((prev) => byNewest(prev.map((r) => (r.id === id ? optimistic : r))));
      if (!isDemo) {
        const updated = await updateBloodPressure(id, input);
        setBp((prev) => byNewest(prev.map((r) => (r.id === id ? updated : r))));
      }
    },
    [isDemo],
  );

  const removeBp = useCallback(
    async (id: string) => {
      setBp((prev) => prev.filter((r) => r.id !== id));
      if (!isDemo) await deleteBloodPressure(id).catch((err) => console.error("deleteBloodPressure failed", err));
    },
    [isDemo],
  );

  // --- Weight ---
  const addWeight = useCallback(
    async (input: NewWeightInput) => {
      if (isDemo) {
        setWeight((prev) =>
          byNewest([{ id: demoId("weight"), measuredAt: input.measuredAt, kg: input.kg, note: input.note.trim() || null }, ...prev]),
        );
        return;
      }
      const created = await createWeight(input);
      setWeight((prev) => byNewest([created, ...prev]));
    },
    [isDemo],
  );

  const editWeight = useCallback(
    async (id: string, input: NewWeightInput) => {
      const optimistic: WeightReading = { id, measuredAt: input.measuredAt, kg: input.kg, note: input.note.trim() || null };
      setWeight((prev) => byNewest(prev.map((r) => (r.id === id ? optimistic : r))));
      if (!isDemo) {
        const updated = await updateWeight(id, input);
        setWeight((prev) => byNewest(prev.map((r) => (r.id === id ? updated : r))));
      }
    },
    [isDemo],
  );

  const removeWeight = useCallback(
    async (id: string) => {
      setWeight((prev) => prev.filter((r) => r.id !== id));
      if (!isDemo) await deleteWeight(id).catch((err) => console.error("deleteWeight failed", err));
    },
    [isDemo],
  );

  return {
    isDemo,
    loading: !isDemo && loading,
    error,
    bp: { data: bp, add: addBp, edit: editBp, remove: removeBp },
    weight: { data: weight, add: addWeight, edit: editWeight, remove: removeWeight },
  };
}
