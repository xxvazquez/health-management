"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { notesConfigured, onNotesChanged, unreadNoteCount } from "@/lib/supabase/notes";
import { readSnapshot, writeSnapshot } from "@/lib/db/indexedDb";

/** Polls rather than subscribing to realtime — Notes has no live-updating
 * requirement (see notes.ts's own comment on this), so a periodic refetch
 * plus a refetch whenever the route changes (covers "just read something in
 * /notes, badge should drop now") is simple and enough for a private
 * couple's-notes feature. Session-gated: no point polling while signed out
 * or before Supabase is configured, both of which make every Notes query a
 * silent no-op anyway. Shared by the sidebar and the mobile bottom bar. */
const UNREAD_POLL_MS = 60_000;

export function useUnreadNoteCount(pathname: string): number {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!notesConfigured || !session) {
      queueMicrotask(() => setCount(0));
      return;
    }
    let cancelled = false;
    // Show the last-synced count straight away so a reload while offline
    // still surfaces the badge instead of a silent zero.
    if (userId) {
      void readSnapshot(userId, "unreadNoteCount").then((snap) => {
        if (!cancelled && snap && typeof snap.payload === "number") setCount(snap.payload);
      });
    }
    const refresh = () => {
      void unreadNoteCount()
        .then((n) => {
          if (cancelled) return;
          setCount(n);
          if (userId) void writeSnapshot(userId, "unreadNoteCount", n);
        })
        .catch(() => {
          // Transient network/RLS hiccup — keep the last known count.
        });
    };
    refresh();
    const interval = setInterval(refresh, UNREAD_POLL_MS);
    const unsubscribe = onNotesChanged(refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
    // `pathname` retriggers this on navigation (e.g. leaving /notes after
    // reading something), not otherwise used.
  }, [session, userId, pathname]);

  return count;
}
