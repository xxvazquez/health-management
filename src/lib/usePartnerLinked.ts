"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useData } from "@/lib/DataContext";
import { getPartnerLink } from "@/lib/supabase/partner";

/**
 * True once a linked partner is confirmed (or in the demo, which simulates
 * a linked state). Gates the Messages nav entry and the shared-scope
 * controls.
 *
 * The last answer is kept per user on the device, so the nav shows the
 * right links from the first paint and still does offline; a successful
 * check replaces it. Module-cached too, so route changes don't refetch. A
 * partner linked mid-session isn't picked up until reload — the
 * partner-link flow can prompt one.
 */
let cache: { userId: string; linked: boolean } | null = null;

const storageKey = (userId: string) => `lauva-partner-linked:${userId}`;

function readStored(userId: string): boolean | null {
  try {
    const v = localStorage.getItem(storageKey(userId));
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function usePartnerLinked(): boolean {
  const { session } = useAuth();
  const { isDemoData } = useData();
  const userId = session?.user.id ?? null;
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (isDemoData || !userId || cache?.userId === userId) return;
    const stored = readStored(userId);
    // A remembered answer — an external read, applied before the network check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored != null) setLinked(stored);
    let cancelled = false;
    getPartnerLink()
      .then((link) => {
        if (cancelled) return;
        cache = { userId, linked: link != null };
        setLinked(cache.linked);
        try {
          localStorage.setItem(storageKey(userId), cache.linked ? "1" : "0");
        } catch {
          // Storage blocked — the answer still holds for this session.
        }
      })
      .catch(() => {
        // Offline or a transient failure — keep the remembered answer.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isDemoData]);

  if (isDemoData) return true;
  if (!userId) return false;
  return cache?.userId === userId ? cache.linked : linked;
}
