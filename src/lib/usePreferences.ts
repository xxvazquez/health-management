"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchPreferences, savePreferences, type Preferences } from "@/lib/supabase/preferences";
import { queueRowSave } from "@/lib/queueRowSave";
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Applies what changed from `before` to `after` onto `base`. A key holding
 * an object (orders, schedules, usual times…) only takes its changed
 * entries, so another device's edits to the other entries survive. */
export function applyPrefsChange(base: Preferences, before: Preferences, after: Preferences): Preferences {
  const out: Record<string, unknown> = { ...base };
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (a[key] === b[key]) continue;
    const was = b[key];
    const now = a[key];
    if (isPlainObject(was) && isPlainObject(now)) {
      const merged: Record<string, unknown> = isPlainObject(out[key]) ? { ...out[key] } : {};
      for (const sub of new Set([...Object.keys(was), ...Object.keys(now)])) {
        if (JSON.stringify(was[sub]) === JSON.stringify(now[sub])) continue;
        if (sub in now) merged[sub] = now[sub];
        else delete merged[sub];
      }
      out[key] = merged;
    } else if (key in a) {
      out[key] = now;
    } else {
      delete out[key];
    }
  }
  return out as Preferences;
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
      queueRowSave({
        table: "user_preferences",
        userId,
        local: next,
        fetchLatest: fetchPreferences,
        change: (base) => applyPrefsChange(base, previous, next),
        save: savePreferences,
      }).catch((err) => {
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
