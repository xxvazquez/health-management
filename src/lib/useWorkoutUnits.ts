"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { getAllItems, withDataLock } from "@/lib/db/indexedDb";
import { buildDemoDataset } from "@/lib/demoData";
import type { WorkoutUnit } from "@/lib/types";

/** Each workout exercise's unit by name. A workout log has no unit of its
 * own; it lives on the matching workout item, re-read after every shared
 * refresh. Demo items never reach IndexedDB, so demo mode reads them from
 * the dataset. */
export function useWorkoutUnits(): Map<string, WorkoutUnit> {
  const { status, events, isDemoData } = useData();
  const [unitByExercise, setUnitByExercise] = useState<Map<string, WorkoutUnit>>(new Map());
  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    void withDataLock(() => getAllItems()).then((stored) => {
      if (cancelled) return;
      const items = isDemoData ? [...buildDemoDataset().items, ...stored] : stored;
      setUnitByExercise(new Map(items.filter((i) => i.itemType === "workout").map((i) => [i.rawName, i.unit ?? "kg"])));
    });
    return () => {
      cancelled = true;
    };
  }, [status, events, isDemoData]);
  return unitByExercise;
}
