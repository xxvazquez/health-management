"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalEvent, RawWorkoutLog, RawStoolLog, RawPeriodLog } from "@/lib/types";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import { clearAllData, getAllDiary, getAllLogs, getAllItems, getAllStoolLogs, getAllWorkoutLogs, getAllPeriodLogs, hasAnyData, withDataLock, type OutboxEntry } from "@/lib/db/indexedDb";
import { pullFromCloud, resetInitialPullState } from "@/lib/supabase/sync";
import { discardDeadLetterEntry, drainOutbox, getDeadLetterEntries, getOutboxSyncState, retryOutboxEntry } from "@/lib/supabase/outbox";
import { ANALYTICS_START_DATE } from "@/lib/config";
import { buildDemoDataset } from "@/lib/demoData";
import { useAuth } from "@/lib/supabase/AuthContext";

export type DataStatus = "loading" | "empty" | "ready" | "error";

/** How many local mutations are waiting to reach Supabase (`pending`) or
 * have permanently failed and won't be retried (`deadLetter`) — sourced
 * from the outbox (see lib/supabase/outbox.ts). Not a general error/status
 * system, just enough to make sync failures visible instead of silent. */
export interface SyncState {
  pending: number;
  deadLetter: number;
}

interface DataContextValue {
  status: DataStatus;
  events: CanonicalEvent[];
  workoutLogs: RawWorkoutLog[];
  stoolLogs: RawStoolLog[];
  periodLogs: RawPeriodLog[];
  /** True while showing the static, in-memory demo dataset (lib/demoData.ts)
   * instead of anything real — always the case while signed out with no
   * local data logged yet, never once signed in or once something's logged. */
  isDemoData: boolean;
  error: string | null;
  syncState: SyncState;
  /** The dead-letter entries behind `syncState.deadLetter` — enough detail
   * (table, error code) for SyncStatusBanner to explain what failed. */
  deadLetterEntries: OutboxEntry[];
  /** Re-queues one dead-letter entry and attempts to send it again. */
  retrySync: (id: string) => Promise<void>;
  /** Permanently gives up on one dead-lettered entry without ever sending
   * it — for a failure Retry can never fix (see discardDeadLetterEntry's
   * own doc comment), most commonly a duplicate-name conflict. The local
   * record itself is never touched by this. */
  discardSync: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<DataStatus>("loading");
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<RawWorkoutLog[]>([]);
  const [stoolLogs, setStoolLogs] = useState<RawStoolLog[]>([]);
  const [periodLogs, setPeriodLogs] = useState<RawPeriodLog[]>([]);
  const [isDemoData, setIsDemoData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ pending: 0, deadLetter: 0 });
  const [deadLetterEntries, setDeadLetterEntries] = useState<OutboxEntry[]>([]);

  const refreshSyncState = useCallback(async () => {
    setSyncState(await getOutboxSyncState());
    setDeadLetterEntries(await getDeadLetterEntries());
  }, []);

  const retrySync = useCallback(
    async (id: string) => {
      await retryOutboxEntry(id);
      await refreshSyncState();
    },
    [refreshSyncState],
  );

  const discardSync = useCallback(
    async (id: string) => {
      await discardDeadLetterEntry(id);
      await refreshSyncState();
    },
    [refreshSyncState],
  );

  /** Triggers a drain then refreshes the pending/dead-letter counts. Safe
   * to call from multiple triggers (below) — drainOutbox itself already
   * guards against running twice concurrently in this tab. */
  const runDrain = useCallback(async () => {
    await drainOutbox();
    await refreshSyncState();
  }, [refreshSyncState]);

  const refresh = useCallback(async () => {
    // Wait for the session check to resolve before deciding what to show —
    // otherwise a signed-in visitor would flash the demo dataset for a
    // moment before their real data replaces it.
    if (authLoading) return;
    setStatus("loading");
    try {
      // Every read below goes through withDataLock as ONE unit, not
      // individually — pullFromCloud's clear-and-repopulate is also one
      // withDataLock call (see sync.ts), so this either runs entirely
      // before it starts or entirely after it finishes, never landing
      // partway through and seeing an empty or half-repopulated cache.
      // (The individual getAllX() reads aren't locked on their own — they're
      // also used from inside other already-locked callbacks elsewhere,
      // where re-acquiring the lock here would deadlock — so the locking
      // has to happen at this call site instead.)
      const snapshot = await withDataLock(async () => {
        const hasData = await hasAnyData();
        // Fetched independently of the food/habit demo overlay below —
        // workout logs are real local data the moment they exist, never
        // part of the synthetic demo dataset, so they should show up even
        // while the rest of the app is still displaying demo food/habit
        // data.
        const workoutLogsAll = await getAllWorkoutLogs();
        // Unfiltered by ANALYTICS_START_DATE, same reasoning as workoutLogs
        // above (real the moment it exists, outside the demo overlay) plus
        // one more: cycle predictions read further back than that fixed
        // cutoff on purpose (see aggregations/cycle.ts), so trimming
        // history here would quietly make them less accurate.
        const periodLogsAll = await getAllPeriodLogs();
        // Reading items/logs/diary/stool unconditionally (even when the
        // "no data" branch below won't use them) keeps this whole snapshot
        // one consistent shape rather than a union — these are cheap local
        // reads, not worth branching around.
        const [items, logs, diary, stoolLogsAll] = await Promise.all([getAllItems(), getAllLogs(), getAllDiary(), getAllStoolLogs()]);
        return { hasData, workoutLogsAll, periodLogsAll, items, logs, diary, stoolLogsAll };
      });
      const workoutLogsNow = snapshot.workoutLogsAll.filter((g) => g.date >= ANALYTICS_START_DATE);
      const periodLogsNow = snapshot.periodLogsAll;
      if (!snapshot.hasData) {
        if (!session) {
          // Signed out with nothing logged locally yet — show the static
          // demo dataset so the app never looks empty to a first-time
          // visitor. Purely in-memory: never touches IndexedDB/Supabase,
          // and disappears the moment something real exists (a local tap,
          // or signing in and pulling real data).
          const demo = buildDemoDataset();
          const scoped = buildCanonicalEvents(demo.items, demo.logs, []).filter((e) => e.date >= ANALYTICS_START_DATE);
          setEvents(scoped);
          // Real workout/period logs (if any exist locally already) always
          // win over the demo ones — only fall back to demo data when
          // there's genuinely nothing real to show yet.
          setWorkoutLogs(workoutLogsNow.length > 0 ? workoutLogsNow : demo.workoutLogs.filter((g) => g.date >= ANALYTICS_START_DATE));
          setStoolLogs(demo.stoolLogs.filter((s) => s.date >= ANALYTICS_START_DATE));
          setPeriodLogs(periodLogsNow.length > 0 ? periodLogsNow : demo.periodLogs);
          setIsDemoData(true);
          setStatus("ready");
          return;
        }
        setEvents([]);
        setWorkoutLogs(workoutLogsNow);
        setStoolLogs([]);
        setPeriodLogs(periodLogsNow);
        setIsDemoData(false);
        // Real workout/period data alone is still real data — only the
        // food/symptom/supplement/habit/stool side is empty. Forcing
        // "empty" here regardless used to hide a workout-only account's own
        // logs behind the shared EmptyState on the Workout page; same idea
        // extended to period-only accounts.
        setStatus(workoutLogsNow.length > 0 || periodLogsNow.length > 0 ? "ready" : "empty");
        return;
      }
      const { items, logs, diary, stoolLogsAll } = snapshot;
      const scoped = buildCanonicalEvents(items, logs, diary).filter((e) => e.date >= ANALYTICS_START_DATE);
      setEvents(scoped);
      setWorkoutLogs(workoutLogsNow);
      setStoolLogs(stoolLogsAll.filter((s) => s.date >= ANALYTICS_START_DATE));
      setPeriodLogs(periodLogsNow);
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
    // pullFromCloud() already attempts a best-effort outbox drain of its
    // own before its destructive clear (see sync.ts) — this just refreshes
    // the counts shown in the UI afterward.
    await pullFromCloud();
    await refresh();
    await refreshSyncState();
  }, [refresh, refreshSyncState]);

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
        // A later sign-in — same user again, or a different one on a
        // shared device — must wait for its OWN fresh pull before
        // ensureCategoryId/ensureDefaultWorkoutItems trust "nothing here
        // yet" (see waitForInitialPull's own doc comment); resetting here
        // stops it from reusing this session's already-resolved gate.
        resetInitialPullState();
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

  // Drain the outbox the moment connectivity returns — the fastest of the
  // triggers, since `online` fires immediately on reconnect rather than
  // waiting for the next tab-focus or the periodic timer below.
  useEffect(() => {
    if (!session) return;
    function handleOnline() {
      void runDrain();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [session, runDrain]);

  // A modest periodic fallback so a tab left open (visible, online, never
  // backgrounded) still retries a backed-off entry eventually, without
  // waiting on the user to trigger one of the other paths.
  useEffect(() => {
    if (!session) return;
    const intervalId = window.setInterval(() => void runDrain(), 5 * 60_000);
    return () => window.clearInterval(intervalId);
  }, [session, runDrain]);

  // Once at startup too, independent of sign-in state changing — e.g. a
  // page reload while already signed in with something left in the
  // outbox from a previous session.
  useEffect(() => {
    // Reading from IndexedDB on mount — an external-system read, not a
    // React-state sync loop, same as the refresh() mount effect above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSyncState();
  }, [refreshSyncState]);

  const value = useMemo(
    () => ({ status, events, workoutLogs, stoolLogs, periodLogs, isDemoData, error, syncState, deadLetterEntries, retrySync, discardSync, refresh, clearData }),
    [status, events, workoutLogs, stoolLogs, periodLogs, isDemoData, error, syncState, deadLetterEntries, retrySync, discardSync, refresh, clearData],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
