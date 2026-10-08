"use client";

import { useCallback, useEffect, useMemo } from "react";
import { normalizeName } from "@/taxonomy/normalizeName";
import { usePreferences } from "@/lib/usePreferences";

const LEGACY_STORAGE_KEY = "lauva.hiddenSeasonalPicks";

/**
 * Produce the person doesn't want surfaced in the Log page's seasonal picks,
 * kept in the synced preferences so every device hides the same ones. Keyed
 * by normalized name so casing/whitespace never splits one item into two
 * hidden entries.
 */
export function useHiddenSeasonalPicks() {
  const { prefs, loaded, update } = usePreferences();
  const saved = prefs.hiddenSeasonalPicks;
  const hidden = useMemo(() => new Set(saved ?? []), [saved]);

  // Picks hidden before this was synced lived in this device's storage;
  // fold them in once, then drop the local copy.
  useEffect(() => {
    if (!loaded) return;
    try {
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw) as string[];
      const merged = Array.from(new Set([...(saved ?? []), ...legacy]));
      if (merged.length !== (saved ?? []).length) update({ hiddenSeasonalPicks: merged });
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Corrupt or inaccessible storage — nothing to carry over.
    }
  }, [loaded, saved, update]);

  const hide = useCallback(
    (item: string) => {
      const key = normalizeName(item);
      if (!hidden.has(key)) update({ hiddenSeasonalPicks: [...hidden, key] });
    },
    [hidden, update],
  );

  const unhide = useCallback(
    (item: string) => {
      const key = normalizeName(item);
      if (hidden.has(key)) update({ hiddenSeasonalPicks: [...hidden].filter((k) => k !== key) });
    },
    [hidden, update],
  );

  return { hidden, hide, unhide };
}
