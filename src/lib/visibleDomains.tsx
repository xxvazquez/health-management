"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";

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

const STORAGE_KEY = "lauva.domainVisibility";
const LEGACY_HIDDEN_KEY = "lauva.hiddenDomains";

/** Explicit per-domain show/hide choices. A domain absent from the map
 * follows the automatic rule (visible once it has logged data). */
type Overrides = Partial<Record<TrackedDomain, boolean>>;

interface VisibleDomainsValue {
  /** Effective visibility for a domain: its explicit override if the user
   * set one in Manage, otherwise automatic — visible once the domain has
   * logged data, and visible for every domain while the account has no
   * data at all. */
  isVisible: (domain: TrackedDomain) => boolean;
  /** Records an explicit show/hide choice for a domain (Manage → Visible
   * sections). Force-showing a data-less domain is how you start tracking
   * it before its first entry exists. */
  setVisible: (domain: TrackedDomain, visible: boolean) => void;
  /** Flips a domain's effective visibility, storing the result as an
   * explicit override. */
  toggle: (domain: TrackedDomain) => void;
}

const VisibleDomainsContext = createContext<VisibleDomainsValue | null>(null);

/**
 * Which tracked sections show up in the Log and Trends tab rails.
 *
 * A section appears automatically once it has logged data, so a new
 * account isn't faced with seven tabs it doesn't use yet — while the
 * account is still empty every section shows, then they fall away to just
 * the ones in use. Manage → Visible sections overrides this per domain in
 * either direction: turn one on to start tracking it before it has data,
 * or off to hide it even once it does.
 *
 * The overrides are purely local (localStorage), not synced to Supabase —
 * same tier as the Log page's collapsed-categories/last-open-tab prefs, a
 * device-specific display choice rather than tracked data. Provided once
 * at the root layout (inside DataProvider, whose data it reads) so Manage,
 * the Log page and the Trends page all react to the exact same live state.
 */
export function VisibleDomainsProvider({ children }: { children: ReactNode }) {
  const { events, workoutLogs, stoolLogs, periodLogs, isDemoData } = useData();
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverrides(JSON.parse(raw) as Overrides);
        return;
      }
      // Migrate the old "hidden domains" list — each hidden entry becomes
      // an explicit off override, everything else goes automatic.
      const legacy = window.localStorage.getItem(LEGACY_HIDDEN_KEY);
      if (legacy) {
        const migrated: Overrides = {};
        for (const d of JSON.parse(legacy) as TrackedDomain[]) migrated[d] = false;
        setOverrides(migrated);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
    } catch {
      // Corrupt or inaccessible storage — everything follows the automatic rule.
    }
  }, []);

  // Domains that currently hold any logged data, plus whether the account
  // is completely empty (in which case every section shows).
  const auto = useMemo(() => {
    const domains = new Set<TrackedDomain>();
    for (const e of events) {
      if (e.itemType === "food" || e.itemType === "outcome" || e.itemType === "supplement" || e.itemType === "habit" || e.itemType === "workout") {
        domains.add(e.itemType);
      }
    }
    if (workoutLogs.length > 0) domains.add("workout");
    if (stoolLogs.length > 0) domains.add("stool");
    if (periodLogs.length > 0) domains.add("cycle");
    return { domains, showAll: isDemoData || domains.size === 0 };
  }, [events, workoutLogs, stoolLogs, periodLogs, isDemoData]);

  const isVisible = useCallback(
    (domain: TrackedDomain) => {
      const override = overrides[domain];
      if (override !== undefined) return override;
      return auto.showAll || auto.domains.has(domain);
    },
    [overrides, auto],
  );

  const setVisible = useCallback((domain: TrackedDomain, visible: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev, [domain]: visible };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Inaccessible storage — the choice still applies for this session.
      }
      return next;
    });
  }, []);

  const toggle = useCallback((domain: TrackedDomain) => setVisible(domain, !isVisible(domain)), [setVisible, isVisible]);

  const value = useMemo(() => ({ isVisible, setVisible, toggle }), [isVisible, setVisible, toggle]);

  return <VisibleDomainsContext.Provider value={value}>{children}</VisibleDomainsContext.Provider>;
}

export function useVisibleDomains(): VisibleDomainsValue {
  const ctx = useContext(VisibleDomainsContext);
  if (!ctx) throw new Error("useVisibleDomains must be used within VisibleDomainsProvider");
  return ctx;
}
