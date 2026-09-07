"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  clearWeightTarget,
  createBloodPressure,
  createWeight,
  deleteBloodPressure,
  deleteWeight,
  fetchBloodPressure,
  fetchWeight,
  fetchWeightTarget,
  setWeightTarget,
  updateBloodPressure,
  updateWeight,
  type BloodPressureReading,
  type NewBloodPressureInput,
  type NewWeightInput,
  type WeightReading,
  type WeightTarget,
} from "@/lib/supabase/vitals";
import { buildDemoBloodPressure, buildDemoWeight, buildDemoWeightTarget } from "@/lib/demoVitals";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Module-level cache so the Health → Vitals tab and the Results tab's
 * overview share one vitals state across client-side navigation — same
 * pattern as useLabs / useCareLog. Keyed by user id, cleared on sign-out. */
let cache: { userId: string; bp: BloodPressureReading[]; weight: WeightReading[]; target: WeightTarget | null } | null = null;

const VITALS_TABLES = ["blood_pressure", "weight_logs", "weight_target"] as const;

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
  const [target, setTarget] = useState<WeightTarget | null>(() => (seed ? seed.target : buildDemoWeightTarget()));
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ bp: BloodPressureReading[]; weight: WeightReading[]; target: WeightTarget | null }>({
    feature: "vitals",
    tables: VITALS_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => {
      const [b, w, t] = await Promise.all([fetchBloodPressure(), fetchWeight(), fetchWeightTarget()]);
      return { bp: b, weight: w, target: t };
    },
    apply: ({ bp: b, weight: w, target: t }) => {
      setBp(byNewest(b));
      setWeight(byNewest(w));
      setTarget(t ?? null);
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
      cache = { userId, bp, weight, target };
      persist({ bp, weight, target });
    }
  }, [userId, isDemo, loading, bp, weight, target, persist]);

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

  // --- Weight target ---
  const saveTarget = useCallback(
    async (next: WeightTarget) => {
      setTarget(next);
      if (!isDemo) await setWeightTarget(next);
    },
    [isDemo],
  );

  const removeTarget = useCallback(async () => {
    setTarget(null);
    if (!isDemo) await clearWeightTarget().catch((err) => console.error("clearWeightTarget failed", err));
  }, [isDemo]);

  return {
    isDemo,
    loading: !isDemo && loading,
    error,
    bp: { data: bp, add: addBp, edit: editBp, remove: removeBp },
    weight: { data: weight, add: addWeight, edit: editWeight, remove: removeWeight, target, setTarget: saveTarget, clearTarget: removeTarget },
  };
}
