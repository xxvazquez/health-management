"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeName } from "@/taxonomy/normalizeName";

const STORAGE_KEY = "lauva.hiddenSeasonalPicks";

/**
 * Produce the person doesn't want surfaced in the Log page's seasonal-picks
 * card — purely local (localStorage), same tier as visibleDomains: a
 * device-specific "don't show me this" choice, not tracked data that needs
 * to follow across devices. Keyed by normalized name so casing/whitespace
 * never splits one item into two hidden entries.
 */
export function useHiddenSeasonalPicks() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt or inaccessible storage — fall back to nothing hidden.
    }
  }, []);

  const persist = useCallback((next: Set<string>) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // Inaccessible storage — the choice still applies for this session,
      // it just won't survive a reload.
    }
  }, []);

  const hide = useCallback(
    (item: string) => {
      setHidden((prev) => {
        const next = new Set(prev).add(normalizeName(item));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const unhide = useCallback(
    (item: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(normalizeName(item));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { hidden, hide, unhide };
}
