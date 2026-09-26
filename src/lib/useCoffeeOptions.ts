"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchCoffeeOptions, defaultCoffeeOptions, type CoffeeOption, type CoffeeOptionKind } from "@/lib/supabase/coffeeOptions";
import { applyOrder, usePreferences } from "@/lib/usePreferences";

export interface ResolvedCoffeeOptions {
  /** Active (non-hidden) labels for each kind — the user's own list where
   * they've customised it, the built-in list otherwise. */
  brewingType: string[];
  brewingMethod: string[];
  characteristic: string[];
}

function activeLabels(rows: CoffeeOption[], kind: CoffeeOptionKind, orders: Record<string, string[]> | undefined): string[] {
  const mine = rows.filter((o) => o.kind === kind);
  if (mine.length === 0) return defaultCoffeeOptions(kind);
  const sorted = mine.filter((o) => !o.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  // Then the account's own order from Settings (drag ≡).
  return applyOrder(sorted, orders?.[`coffee:${kind}`], (o) => o.id)
    .map((o) => o.label);
}

/** The brewing-type / brewing-method / characteristic chip lists for the
 * Coffee log form, resolved from `coffee_options` with a fallback to the
 * built-in defaults per kind. Signed out it's just the defaults. */
export function useCoffeeOptions(): ResolvedCoffeeOptions {
  const { session } = useAuth();
  const { prefs } = usePreferences();
  const [rows, setRows] = useState<CoffeeOption[]>([]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchCoffeeOptions()
      .then((data) => !cancelled && setRows(data))
      .catch((err) => console.error("fetchCoffeeOptions failed", err));
    return () => {
      cancelled = true;
    };
  }, [session]);

  return {
    brewingType: activeLabels(rows, "brewing_type", prefs.orders),
    brewingMethod: activeLabels(rows, "brewing_method", prefs.orders),
    characteristic: activeLabels(rows, "characteristic", prefs.orders),
  };
}
