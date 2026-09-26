"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchStoolOptions, defaultStoolOptions, type StoolOption } from "@/lib/supabase/stoolOptions";
import { STOOL_COLOR_SWATCH, type StoolOptionKind } from "@/lib/types";
import { applyOrder, usePreferences } from "@/lib/usePreferences";

export interface ResolvedStoolOptions {
  /** Active (non-hidden) labels for each kind — the user's own list where
   * they've customised it, the built-in list otherwise. */
  color: string[];
  symptom: string[];
  floatation: string[];
  characteristic: string[];
  /** Hex dot for a colour label, or null. */
  swatchFor: (label: string) => string | null;
}

function activeLabels(rows: StoolOption[], kind: StoolOptionKind, orders: Record<string, string[]> | undefined): string[] {
  const mine = rows.filter((o) => o.kind === kind);
  if (mine.length === 0) return defaultStoolOptions(kind);
  const sorted = mine.filter((o) => !o.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  // Then the account's own order from Settings (drag ≡).
  return applyOrder(sorted, orders?.[`stool:${kind}`], (o) => o.id)
    .map((o) => o.label);
}

/** The colour / symptom / floatation / characteristic chip lists for the
 * Stool tab, resolved from `stool_options` with a fallback to the built-in
 * defaults per kind. Signed out it's just the defaults. */
export function useStoolOptions(): ResolvedStoolOptions {
  const { session } = useAuth();
  const { prefs } = usePreferences();
  const [rows, setRows] = useState<StoolOption[]>([]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchStoolOptions()
      .then((data) => !cancelled && setRows(data))
      .catch((err) => console.error("fetchStoolOptions failed", err));
    return () => {
      cancelled = true;
    };
  }, [session]);

  const swatchByLabel = new Map(rows.filter((o) => o.kind === "color" && o.swatch).map((o) => [o.label, o.swatch as string]));

  return {
    color: activeLabels(rows, "color", prefs.orders),
    symptom: activeLabels(rows, "symptom", prefs.orders),
    floatation: activeLabels(rows, "floatation", prefs.orders),
    characteristic: activeLabels(rows, "characteristic", prefs.orders),
    swatchFor: (label) => swatchByLabel.get(label) ?? STOOL_COLOR_SWATCH[label] ?? null,
  };
}
