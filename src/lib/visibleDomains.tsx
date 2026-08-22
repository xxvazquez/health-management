"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Every top-level tracked section a user might not want — the Log page's
 * tabs plus the two standalone ones (Stool, Workout also doubles as a Log
 * tab), matched 1:1 against Nav's analytics links wherever one exists. Not
 * an `ItemType` on its own since Stool/Workout/Cycle aren't item types. */
export type TrackedDomain = "food" | "outcome" | "supplement" | "habit" | "stool" | "workout" | "cycle";

export const DOMAIN_LABELS: Record<TrackedDomain, string> = {
  food: "Food",
  outcome: "Symptoms",
  supplement: "Supplements",
  habit: "Habits",
  stool: "Stool",
  workout: "Workout",
  cycle: "Cycle",
};

const STORAGE_KEY = "lauva.hiddenDomains";

interface VisibleDomainsValue {
  hidden: Set<TrackedDomain>;
  isHidden: (domain: TrackedDomain) => boolean;
  toggle: (domain: TrackedDomain) => void;
}

const VisibleDomainsContext = createContext<VisibleDomainsValue | null>(null);

/**
 * Purely local (localStorage), not synced to Supabase — same tier as the
 * Log page's collapsed-categories/last-open-tab prefs, not a piece of
 * tracked data. A device-specific "I don't track this" choice, not
 * something that needs to follow you across devices. Provided once at the
 * root layout so Manage (where it's toggled), the Log page, and Nav (both
 * of which react to it) all read the exact same live state — a plain
 * per-component localStorage read wouldn't update the other two the
 * moment one of them changes it.
 */
export function VisibleDomainsProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<Set<TrackedDomain>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setHidden(new Set(JSON.parse(raw) as TrackedDomain[]));
    } catch {
      // Corrupt or inaccessible storage — fall back to everything visible.
    }
  }, []);

  const toggle = useCallback((domain: TrackedDomain) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Inaccessible storage — the choice still applies for this
        // session, it just won't survive a reload.
      }
      return next;
    });
  }, []);

  const isHidden = useCallback((domain: TrackedDomain) => hidden.has(domain), [hidden]);

  const value = useMemo(() => ({ hidden, isHidden, toggle }), [hidden, isHidden, toggle]);

  return <VisibleDomainsContext.Provider value={value}>{children}</VisibleDomainsContext.Provider>;
}

export function useVisibleDomains(): VisibleDomainsValue {
  const ctx = useContext(VisibleDomainsContext);
  if (!ctx) throw new Error("useVisibleDomains must be used within VisibleDomainsProvider");
  return ctx;
}
