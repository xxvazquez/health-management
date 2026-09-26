"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { useCoffee } from "@/lib/useCoffee";
import { applyOrder, usePreferences } from "@/lib/usePreferences";

/** Every top-level tracked section a user might not want — the Log page's
 * tabs plus the two standalone ones (Stool, Workout also doubles as a Log
 * tab), matched 1:1 against Nav's analytics links wherever one exists. Not
 * an `ItemType` on its own since Stool/Workout/Cycle aren't item types. */
export type TrackedDomain = "food" | "outcome" | "supplement" | "habit" | "stool" | "workout" | "cycle" | "coffee";

export const DOMAIN_LABELS: Record<TrackedDomain, string> = {
  food: "Food",
  outcome: "Symptoms",
  supplement: "Supplements",
  habit: "Habits",
  stool: "Stool",
  workout: "Workout",
  cycle: "Cycle",
  coffee: "Coffee",
};

const ALL_DOMAINS = Object.keys(DOMAIN_LABELS) as TrackedDomain[];
const DOMAIN_ORDER_KEY = "domains";

// Where this device used to keep the choices, before they synced.
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
  /** Every tracked section in the account's chosen order. */
  domainOrder: TrackedDomain[];
  setDomainOrder: (order: TrackedDomain[]) => void;
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
 * The overrides and the sections' order live in the account's synced
 * preferences (usePreferences), so every device shows the same tabs in the
 * same order. Provided once
 * at the root layout (inside DataProvider, whose data it reads) so Manage,
 * the Log page and the Trends page all react to the exact same live state.
 */
export function VisibleDomainsProvider({ children }: { children: ReactNode }) {
  const { events, workoutLogs, stoolLogs, periodLogs, isDemoData } = useData();
  // Coffee lives outside DataContext's older items/logs mirror (see
  // useCoffee.ts) — fetched here too, same as every other domain, just via
  // its own modern snapshot-cache hook instead of DataContext's.
  const coffee = useCoffee();
  const { prefs, loaded, update } = usePreferences();
  const overrides = useMemo(() => (prefs.domainVisibility ?? {}) as Overrides, [prefs.domainVisibility]);

  // One-time move of this device's old local choices into the account-wide
  // preferences, so they carry over to every device.
  useEffect(() => {
    if (!loaded || prefs.domainVisibility) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const legacy = window.localStorage.getItem(LEGACY_HIDDEN_KEY);
      let migrated: Overrides | null = raw ? (JSON.parse(raw) as Overrides) : null;
      if (!migrated && legacy) {
        migrated = {};
        for (const d of JSON.parse(legacy) as TrackedDomain[]) migrated[d] = false;
      }
      if (migrated && Object.keys(migrated).length > 0) update({ domainVisibility: migrated });
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_HIDDEN_KEY);
    } catch {
      // Corrupt or inaccessible storage — nothing to carry over.
    }
  }, [loaded, prefs.domainVisibility, update]);

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
    if (coffee.logs.data.length > 0) domains.add("coffee");
    return { domains, showAll: isDemoData || domains.size === 0 };
  }, [events, workoutLogs, stoolLogs, periodLogs, isDemoData, coffee.logs.data]);

  const isVisible = useCallback(
    (domain: TrackedDomain) => {
      const override = overrides[domain];
      if (override !== undefined) return override;
      return auto.showAll || auto.domains.has(domain);
    },
    [overrides, auto],
  );

  const setVisible = useCallback(
    (domain: TrackedDomain, visible: boolean) => update({ domainVisibility: { ...overrides, [domain]: visible } }),
    [overrides, update],
  );

  // The order the tracked sections show in, on Log and Trends alike.
  const domainOrder = useMemo(() => applyOrder(ALL_DOMAINS, prefs.orders?.[DOMAIN_ORDER_KEY], (d) => d), [prefs.orders]);
  const setDomainOrder = useCallback((next: TrackedDomain[]) => update({ orders: { ...prefs.orders, [DOMAIN_ORDER_KEY]: next } }), [prefs.orders, update]);

  const toggle = useCallback((domain: TrackedDomain) => setVisible(domain, !isVisible(domain)), [setVisible, isVisible]);

  const value = useMemo(() => ({ isVisible, setVisible, toggle, domainOrder, setDomainOrder }), [isVisible, setVisible, toggle, domainOrder, setDomainOrder]);

  return <VisibleDomainsContext.Provider value={value}>{children}</VisibleDomainsContext.Provider>;
}

export function useVisibleDomains(): VisibleDomainsValue {
  const ctx = useContext(VisibleDomainsContext);
  if (!ctx) throw new Error("useVisibleDomains must be used within VisibleDomainsProvider");
  return ctx;
}
