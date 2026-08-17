"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CanonicalEvent, RawGymLog } from "@/lib/types";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import { filterArchivedItems } from "@/lib/canonical/filterArchivedItems";
import {
  clearAllData,
  getAllDiary,
  getAllLogs,
  getAllItems,
  getAllUserOverrides,
  getAllGymLogs,
  hasAnyData,
} from "@/lib/db/indexedDb";
import { ANALYTICS_START_DATE } from "@/lib/config";
import { buildDemoDataset } from "@/lib/demoData";
import { useAuth } from "@/lib/supabase/AuthContext";

export type DataStatus = "loading" | "empty" | "ready" | "error";

interface DataContextValue {
  status: DataStatus;
  events: CanonicalEvent[];
  gymLogs: RawGymLog[];
  unclassifiedItems: string[];
  archivedItems: { item: string; lastTrackedDate: string }[];
  /** True while showing the static, in-memory demo dataset (lib/demoData.ts)
   * instead of anything real — always the case while signed out with no
   * local data logged yet, never once signed in or once something's logged. */
  isDemoData: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<DataStatus>("loading");
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [gymLogs, setGymLogs] = useState<RawGymLog[]>([]);
  const [unclassifiedItems, setUnclassifiedItems] = useState<string[]>([]);
  const [archivedItems, setArchivedItems] = useState<{ item: string; lastTrackedDate: string }[]>([]);
  const [isDemoData, setIsDemoData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Wait for the session check to resolve before deciding what to show —
    // otherwise a signed-in visitor would flash the demo dataset for a
    // moment before their real data replaces it.
    if (authLoading) return;
    setStatus("loading");
    try {
      const hasData = await hasAnyData();
      // Fetched independently of the food/habit demo overlay below — gym
      // logs are real local data the moment they exist, never part of the
      // synthetic demo dataset, so they should show up even while the rest
      // of the app is still displaying demo food/habit data.
      const gymLogsNow = (await getAllGymLogs()).filter((g) => g.date >= ANALYTICS_START_DATE);
      if (!hasData) {
        if (!session) {
          // Signed out with nothing logged locally yet — show the static
          // demo dataset so the app never looks empty to a first-time
          // visitor. Purely in-memory: never touches IndexedDB/Supabase,
          // and disappears the moment something real exists (a local tap,
          // or signing in and pulling real data).
          const demo = buildDemoDataset();
          const result = buildCanonicalEvents(demo.items, demo.logs, []);
          const scoped = result.events.filter((e) => e.date >= ANALYTICS_START_DATE);
          const active = filterArchivedItems(scoped);
          setEvents(active.events);
          setGymLogs(gymLogsNow);
          setUnclassifiedItems(result.unclassifiedItems);
          setArchivedItems(active.archivedItems);
          setIsDemoData(true);
          setStatus("ready");
          return;
        }
        setEvents([]);
        setGymLogs(gymLogsNow);
        setUnclassifiedItems([]);
        setArchivedItems([]);
        setIsDemoData(false);
        setStatus("empty");
        return;
      }
      const [items, logs, diary, userOverrides] = await Promise.all([
        getAllItems(),
        getAllLogs(),
        getAllDiary(),
        getAllUserOverrides(),
      ]);
      const result = buildCanonicalEvents(items, logs, diary, userOverrides);
      const scoped = result.events.filter((e) => e.date >= ANALYTICS_START_DATE);
      const active = filterArchivedItems(scoped);
      setEvents(active.events);
      setGymLogs(gymLogsNow);
      setUnclassifiedItems(result.unclassifiedItems);
      setArchivedItems(active.archivedItems);
      setIsDemoData(false);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [session, authLoading]);

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
    () => ({ status, events, gymLogs, unclassifiedItems, archivedItems, isDemoData, error, refresh, clearData }),
    [status, events, gymLogs, unclassifiedItems, archivedItems, isDemoData, error, refresh, clearData],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
