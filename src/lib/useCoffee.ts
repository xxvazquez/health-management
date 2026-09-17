"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  createCoffeeItem,
  createCoffeeLog,
  deleteCoffeeLog,
  fetchCoffeeCurrency,
  fetchCoffeeItems,
  fetchCoffeeLogs,
  setCoffeeCurrency,
  updateCoffeeItem,
  updateCoffeeLog,
  type CoffeeItem,
  type CoffeeItemPatch,
  type CoffeeLog,
  type NewCoffeeItemInput,
  type NewCoffeeLogInput,
} from "@/lib/supabase/coffee";
import { buildDemoCoffeeCurrency, buildDemoCoffeeItems, buildDemoCoffeeLogs } from "@/lib/demoCoffee";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Module-level cache so the Log page's Coffee tab and Manage → Coffee
 * share one state across client-side navigation — same pattern as
 * useVitals / useLabs / useCareLog. Keyed by user id, cleared on sign-out. */
let cache: { userId: string; items: CoffeeItem[]; logs: CoffeeLog[]; currency: string } | null = null;

const COFFEE_TABLES = ["coffee_items", "coffee_logs", "coffee_settings"] as const;

function demoId(): string {
  return `demo-coffee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const byNewest = (list: CoffeeLog[]) => [...list].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

export function useCoffee() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [items, setItems] = useState<CoffeeItem[]>(() => seed?.items ?? buildDemoCoffeeItems());
  const [logs, setLogs] = useState<CoffeeLog[]>(() => seed?.logs ?? buildDemoCoffeeLogs());
  const [currency, setCurrencyState] = useState<string>(() => seed?.currency ?? buildDemoCoffeeCurrency());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ items: CoffeeItem[]; logs: CoffeeLog[]; currency: string }>({
    feature: "coffee",
    tables: COFFEE_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => {
      const [i, l, c] = await Promise.all([fetchCoffeeItems(), fetchCoffeeLogs(), fetchCoffeeCurrency()]);
      return { items: i, logs: l, currency: c };
    },
    apply: ({ items: i, logs: l, currency: c }) => {
      setItems(i);
      setLogs(byNewest(l));
      setCurrencyState(c);
      setError(false);
    },
    onSettled: () => setLoading(false),
    onError: () => setError(true),
  });

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) {
      cache = { userId, items, logs, currency };
      persist({ items, logs, currency });
    }
  }, [userId, isDemo, loading, items, logs, currency, persist]);

  // --- Items (catalog) ---
  const addItem = useCallback(
    async (input: NewCoffeeItemInput) => {
      if (isDemo) {
        const created: CoffeeItem = { id: demoId(), name: input.name.trim(), brand: input.brand.trim() || null, notes: input.notes.trim() || null, isArchived: false };
        setItems((prev) => [...prev, created]);
        return created;
      }
      const created = await createCoffeeItem(input);
      setItems((prev) => [...prev, created]);
      return created;
    },
    [isDemo],
  );

  const editItem = useCallback(
    async (item: CoffeeItem, patch: CoffeeItemPatch) => {
      const optimistic: CoffeeItem = {
        ...item,
        name: patch.name !== undefined ? patch.name.trim() : item.name,
        brand: patch.brand !== undefined ? patch.brand.trim() || null : item.brand,
        notes: patch.notes !== undefined ? patch.notes.trim() || null : item.notes,
        isArchived: patch.isArchived !== undefined ? patch.isArchived : item.isArchived,
      };
      setItems((prev) => prev.map((it) => (it.id === item.id ? optimistic : it)));
      if (!isDemo) {
        const updated = await updateCoffeeItem(item, patch);
        setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      }
    },
    [isDemo],
  );

  // --- Logs (per cup) ---
  const addLog = useCallback(
    async (input: NewCoffeeLogInput) => {
      if (isDemo) {
        const created: CoffeeLog = {
          id: demoId(),
          itemId: input.itemId,
          date: input.date,
          loggedAt: input.loggedAt,
          cafe: input.cafe.trim() || null,
          price: input.price,
          brewingType: input.brewingType,
          brewingMethod: input.brewingMethod,
          waterTempC: input.waterTempC,
          characteristics: input.characteristics,
          note: input.note.trim() || null,
        };
        setLogs((prev) => byNewest([created, ...prev]));
        return created;
      }
      const created = await createCoffeeLog(input);
      setLogs((prev) => byNewest([created, ...prev]));
      return created;
    },
    [isDemo],
  );

  const editLog = useCallback(
    async (id: string, input: NewCoffeeLogInput) => {
      const optimistic: CoffeeLog = {
        id,
        itemId: input.itemId,
        date: input.date,
        loggedAt: input.loggedAt,
        cafe: input.cafe.trim() || null,
        price: input.price,
        brewingType: input.brewingType,
        brewingMethod: input.brewingMethod,
        waterTempC: input.waterTempC,
        characteristics: input.characteristics,
        note: input.note.trim() || null,
      };
      setLogs((prev) => byNewest(prev.map((l) => (l.id === id ? optimistic : l))));
      if (!isDemo) {
        const updated = await updateCoffeeLog(id, input);
        setLogs((prev) => byNewest(prev.map((l) => (l.id === id ? updated : l))));
      }
    },
    [isDemo],
  );

  const removeLog = useCallback(
    async (id: string) => {
      setLogs((prev) => prev.filter((l) => l.id !== id));
      if (!isDemo) await deleteCoffeeLog(id).catch((err) => console.error("deleteCoffeeLog failed", err));
    },
    [isDemo],
  );

  // --- Currency ---
  const setCurrency = useCallback(
    async (next: string) => {
      setCurrencyState(next);
      if (!isDemo) await setCoffeeCurrency(next);
    },
    [isDemo],
  );

  return {
    isDemo,
    loading: !isDemo && loading,
    error,
    items: { data: items, add: addItem, edit: editItem },
    logs: { data: logs, add: addLog, edit: editLog, remove: removeLog },
    currency: { value: currency, set: setCurrency },
  };
}
