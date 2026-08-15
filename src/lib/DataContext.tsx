"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CanonicalEvent } from "@/lib/types";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import {
  clearAllData,
  getAllDiary,
  getAllEvents,
  getAllHabits,
  hasAnyData,
} from "@/lib/db/indexedDb";
import { ANALYTICS_START_DATE } from "@/lib/config";

export type DataStatus = "loading" | "empty" | "ready" | "error";

interface DataContextValue {
  status: DataStatus;
  events: CanonicalEvent[];
  unclassifiedItems: string[];
  error: string | null;
  refresh: () => Promise<void>;
  clearData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [unclassifiedItems, setUnclassifiedItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const hasData = await hasAnyData();
      if (!hasData) {
        setEvents([]);
        setUnclassifiedItems([]);
        setStatus("empty");
        return;
      }
      const [habits, rawEvents, diary] = await Promise.all([
        getAllHabits(),
        getAllEvents(),
        getAllDiary(),
      ]);
      const result = buildCanonicalEvents(habits, rawEvents, diary);
      const scoped = result.events.filter((e) => e.date >= ANALYTICS_START_DATE);
      setEvents(scoped);
      setUnclassifiedItems(result.unclassifiedItems);
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
    () => ({ status, events, unclassifiedItems, error, refresh, clearData }),
    [status, events, unclassifiedItems, error, refresh, clearData],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
