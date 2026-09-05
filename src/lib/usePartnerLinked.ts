"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useData } from "@/lib/DataContext";
import { getPartnerLink } from "@/lib/supabase/partner";

/**
 * True once a linked partner is confirmed (or in the demo, which simulates
 * a linked state). Gates the Messages nav entry now, and the shared-scope
 * controls in Step 3.
 *
 * Module-cached per user id so the nav doesn't refetch on every route
 * change. A partner linked mid-session isn't picked up until reload — an
 * acceptable edge (see the IA review's R10); the partner-link flow can
 * prompt one.
 */
let cache: { userId: string; linked: boolean } | null = null;

export function usePartnerLinked(): boolean {
  const { session } = useAuth();
  const { isDemoData } = useData();
  const userId = session?.user.id ?? null;
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (isDemoData || !userId || cache?.userId === userId) return;
    let cancelled = false;
    getPartnerLink()
      .then((link) => {
        if (cancelled) return;
        cache = { userId, linked: link != null };
        setLinked(cache.linked);
      })
      .catch(() => {
        // Transient failure — stays unlinked; a reload retries.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isDemoData]);

  if (isDemoData) return true;
  if (!userId) return false;
  return cache?.userId === userId ? cache.linked : linked;
}
