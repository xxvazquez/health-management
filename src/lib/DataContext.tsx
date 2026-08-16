"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CanonicalEvent } from "@/lib/types";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import { filterArchivedItems } from "@/lib/canonical/filterArchivedItems";
import {
  clearAllData,
  getAllDiary,
  getAllEvents,
  getAllHabits,
  getAllUserOverrides,
  hasAnyData,
} from "@/lib/db/indexedDb";
import { ANALYTICS_START_DATE } from "@/lib/config";

export type DataStatus = "loading" | "empty" | "ready" | "error";

interface DataContextValue {
  status: DataStatus;
  events: CanonicalEvent[];
  unclassifiedItems: string[];
  archivedItems: { item: string; lastTrackedDate: string }[];
  error: string | null;
  refresh: () => Promise<void>;
  clearData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [unclassifiedItems, setUnclassifiedItems] = useState<string[]>([]);
  const [archivedItems, setArchivedItems] = useState<{ item: string; lastTrackedDate: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const hasData = await hasAnyData();
      if (!hasData) {
        setEvents([]);
        setUnclassifiedItems([]);
        setArchivedItems([]);
        setStatus("empty");
        return;
      }
      const [habits, rawEvents, diary, userOverrides] = await Promise.all([
        getAllHabits(),
        getAllEvents(),
        getAllDiary(),
        getAllUserOverrides(),
      ]);
      const result = buildCanonicalEvents(habits, rawEvents, diary, userOverrides);
      const scoped = result.events.filter((e) => e.date >= ANALYTICS_START_DATE);
      const active = filterArchivedItems(scoped);
      setEvents(active.events);
      setUnclassifiedItems(result.unclassifiedItems);
      setArchivedItems(active.archivedItems);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const clearData = useCallback(async () => {
    await clearAllData();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    // Loading from IndexedDB on mount — an external-system read, not a
    // React-state sync loop, so the async setState it triggers is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, events, unclassifiedItems, archivedItems, error, refresh, clearData }),
    [status, events, unclassifiedItems, archivedItems, error, refresh, clearData],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
