"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { pullFromCloud } from "@/lib/supabase/sync";
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
  /** Pulls the signed-in user's latest rows from Supabase into the local
   * IndexedDB cache, then re-derives state from it. No-op while signed
   * out. Exposed so the one manual "Refresh" control in the nav can share
   * this instead of duplicating the pull+refresh sequence. */
  syncFromCloud: () => Promise<void>;
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
        // Real gym data alone is still real data — only the food/symptom/
        // supplement/habit side is empty. Forcing "empty" here regardless
        // used to hide a gym-only account's own logs behind the shared
        // EmptyState on the Gym page.
        setStatus(gymLogsNow.length > 0 ? "ready" : "empty");
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

  const syncFromCloud = useCallback(async () => {
    // Silently a no-op while signed out — every call site can fire this
    // unconditionally and it just does nothing until there's a session.
    await pullFromCloud();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    // Loading from IndexedDB on mount — an external-system read, not a
    // React-state sync loop, so the async setState it triggers is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Pulls Supabase into the local cache once per sign-in — covering both a
  // page load/reload while already signed in and the moment a fresh
  // sign-in resolves — rather than only when the Log page happens to be
  // the one mounted. This provider lives at the root and survives
  // client-side navigation between pages, so this does not re-run on
  // every route change, only on an actual session change.
  const pulledForUserId = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // Signing out after a real sync happened this session — wipe the
      // local cache so this device stops showing (or leaking, on a
      // shared computer) the account that just signed out. Guest-mode
      // local logging afterward is still fine; this only fires once, at
      // the sign-out transition itself.
      if (pulledForUserId.current !== null) {
        pulledForUserId.current = null;
        void clearAllData().then(() => refresh());
      }
      return;
    }
    if (pulledForUserId.current === session.user.id) return;
    pulledForUserId.current = session.user.id;
    void syncFromCloud();
  }, [session, authLoading, syncFromCloud, refresh]);

  // Revalidate from Supabase when the tab regains focus, so data changed
  // on another device shows up without a manual refresh.
  useEffect(() => {
    if (!session) return;
    function handleVisibility() {
      if (document.visibilityState === "visible") void syncFromCloud();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [session, syncFromCloud]);

  const value = useMemo(
    () => ({ status, events, gymLogs, unclassifiedItems, archivedItems, isDemoData, error, refresh, syncFromCloud, clearData }),
    [status, events, gymLogs, unclassifiedItems, archivedItems, isDemoData, error, refresh, syncFromCloud, clearData],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
