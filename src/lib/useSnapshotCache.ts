"use client";

import { useCallback, useEffect, useRef } from "react";
import { hasOutboxEntriesForTables, readSnapshot, writeSnapshot } from "@/lib/db/indexedDb";
import { onCloudRefresh } from "@/lib/cloudRefresh";

interface Options<B> {
  /** Snapshot key segment — one per hook, e.g. "doctors", "labs". */
  feature: string;
  /** Every Supabase table this hook's data comes from. Pass a
   * module-level constant array so its identity is stable. */
  tables: readonly string[];
  userId: string | null;
  isDemo: boolean;
  /** True when the hook already seeded from its in-memory cross-nav cache
   * — then there's nothing to hydrate and no first-load spinner. */
  seeded: boolean;
  /** Network fetch → the bundle the hook renders. */
  fetcher: () => Promise<B>;
  /** Push a bundle (from the snapshot or a fetch) into the hook's state. */
  apply: (bundle: B) => void;
  /** Called once the first fetch/hydrate settles, so the hook can drop its
   * loading flag. */
  onSettled: () => void;
  /** Called when a fetch fails and there was no snapshot to fall back on —
   * a genuine "offline with nothing cached" error. */
  onError: () => void;
}

/**
 * Offline reads for a direct-to-Supabase hook. Hydrates the hook from its
 * last-synced snapshot instantly, then fetches; a fetch that fails with a
 * snapshot already shown is not an error. Re-fetches on every cloud pull
 * (see cloudRefresh.ts). Never applies a fetch result while the outbox
 * still holds a write for one of this feature's tables — that write hasn't
 * reached Supabase, so the server copy is stale and could, worst case,
 * resurrect a row deleted offline.
 *
 * The hook keeps ownership of its own state and loading/error flags; this
 * only drives when to read, fetch and cache. Persisting the *rendered*
 * bundle after an optimistic edit is the caller's job — call the returned
 * `persist` from wherever it already syncs its in-memory cache.
 */
export function useSnapshotCache<B>({ feature, tables, userId, isDemo, seeded, fetcher, apply, onSettled, onError }: Options<B>) {
  // Keep the latest callbacks reachable from the effects below without
  // making them effect dependencies — the callers pass fresh closures
  // every render, and re-subscribing on each would refetch in a loop.
  const refs = useRef({ fetcher, apply, onSettled, onError });
  useEffect(() => {
    refs.current = { fetcher, apply, onSettled, onError };
  });

  const reload = useCallback(async () => {
    if (isDemo || !userId) return;
    try {
      const fresh = await refs.current.fetcher();
      if (await hasOutboxEntriesForTables(userId, tables)) return;
      refs.current.apply(fresh);
      await writeSnapshot(userId, feature, fresh);
    } catch {
      const snap = await readSnapshot(userId, feature).catch(() => undefined);
      if (!snap) refs.current.onError();
    } finally {
      refs.current.onSettled();
    }
  }, [feature, tables, userId, isDemo]);

  useEffect(() => {
    if (isDemo || !userId) return;
    let cancelled = false;
    void (async () => {
      if (!seeded) {
        const snap = await readSnapshot(userId, feature).catch(() => undefined);
        if (!cancelled && snap) {
          refs.current.apply(snap.payload as B);
          refs.current.onSettled();
        }
      }
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isDemo, feature, seeded, reload]);

  useEffect(() => {
    if (isDemo || !userId) return;
    return onCloudRefresh(() => void reload());
  }, [isDemo, userId, reload]);

  const persist = useCallback(
    (bundle: B) => {
      if (isDemo || !userId) return;
      void writeSnapshot(userId, feature, bundle);
    },
    [isDemo, userId, feature],
  );

  return { reload, persist };
}
