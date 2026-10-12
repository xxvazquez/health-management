"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchPreferences, savePreferences, type Preferences } from "@/lib/supabase/preferences";
import { withSendTimeout } from "@/lib/supabase/outbox";
import { hasPendingOutboxEntry } from "@/lib/db/indexedDb";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

const PREFERENCES_TABLES = ["user_preferences"] as const;

/** One copy shared by every component, so a change shows everywhere at
 * once. `loaded` turns true once the account's row has been read. */
let shared: { userId: string | null; prefs: Preferences; loaded: boolean } = { userId: null, prefs: {}, loaded: false };
const listeners = new Set<() => void>();

// Every component using this hook refetches on the same cue; they share one
// request instead of each sending their own.
let inflight: Promise<Preferences> | null = null;
function fetchOnce(): Promise<Preferences> {
  inflight ??= fetchPreferences().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Saves go out one at a time, each applying only its changed keys onto
 * the latest copy on the server — so quick changes can't land out of order,
 * and a change made on another device isn't overwritten by this one's older
 * copy. Offline, or while an earlier save is still queued, the local copy
 * is the base. */
let saveChain: Promise<void> = Promise.resolve();
function queueSave(userId: string, patch: Partial<Preferences>, local: Preferences): Promise<void> {
  const run = async () => {
    const queued = await hasPendingOutboxEntry(userId, `user_preferences:${userId}`);
    const base = queued ? local : await withSendTimeout(fetchPreferences()).catch(() => local);
    await savePreferences({ ...base, ...patch });
  };
  const saved = saveChain.then(run, run);
  saveChain = saved.catch(() => undefined);
  return saved;
}

function publish(next: typeof shared) {
  shared = next;
  for (const l of listeners) l();
}

/** Account-wide preferences (synced to every device), with a patch-style
 * setter. Signed out, changes last for the session only. */
export function usePreferences() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const [, rerender] = useState(0);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (shared.userId !== userId) publish({ userId, prefs: {}, loaded: isDemo });
  }, [userId, isDemo]);

  const { persist } = useSnapshotCache<{ prefs: Preferences }>({
    feature: "preferences",
    tables: PREFERENCES_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: shared.userId === userId && shared.loaded,
    fetcher: async () => ({ prefs: await fetchOnce() }),
    apply: ({ prefs }) => publish({ userId, prefs, loaded: true }),
    onSettled: () => {
      if (!shared.loaded) publish({ ...shared, loaded: true });
    },
    onError: () => {},
  });

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      const previous = shared.prefs;
      const next = { ...previous, ...patch };
      publish({ ...shared, prefs: next });
      if (isDemo || !userId) return;
      persist({ prefs: next });
      queueSave(userId, patch, next).catch((err) => {
        console.error("preferences save failed", err);
        const reverted = Object.fromEntries(Object.keys(patch).map((k) => [k, previous[k as keyof Preferences]]));
        publish({ ...shared, prefs: { ...shared.prefs, ...reverted } });
      });
    },
    [userId, isDemo, persist],
  );

  const setOrder = useCallback((key: string, keys: string[]) => update({ orders: { ...shared.prefs.orders, [key]: keys } }), [update]);

  return { prefs: shared.userId === userId ? shared.prefs : {}, loaded: shared.userId === userId && shared.loaded, update, setOrder };
}

/** `items` in the saved order for `key`: listed ones first, in that order,
 * then the rest as they came. */
export function applyOrder<T>(items: readonly T[], order: readonly string[] | undefined, keyOf: (item: T) => string): T[] {
  if (!order || order.length === 0) return [...items];
  const position = new Map(order.map((k, i) => [k, i]));
  return items
    .map((item, i) => ({ item, i, p: position.get(keyOf(item)) }))
    .sort((a, b) => {
      if (a.p != null && b.p != null) return a.p - b.p;
      if (a.p != null) return -1;
      if (b.p != null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}
