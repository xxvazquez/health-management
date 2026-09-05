"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "lauva.dismissedAttentionItems";

/**
 * Which Overview "Needs attention" rows the person has dismissed — purely
 * local (localStorage), same tier as `useHiddenSeasonalPicks`: a
 * device-specific "stop showing me this" choice, not synced data. Dismissed
 * keys are per-instance ids (a reminder, an expiry, a follow-up, an
 * appointment) so once that item is actually dealt with it drops out of the
 * attention list on its own and the stale key just sits unused in storage.
 */
export function useDismissedAttentionItems() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt or inaccessible storage — fall back to nothing dismissed.
    }
  }, []);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(key);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Inaccessible storage — the dismissal still applies for this
        // session, it just won't survive a reload.
      }
      return next;
    });
  }, []);

  return { dismissed, dismiss };
}
