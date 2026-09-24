"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchPalette, savePalette } from "@/lib/supabase/palette";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Room for plenty of colours without the swatch row turning into a wall. */
export const PALETTE_LIMIT = 24;

const PALETTE_TABLES = ["color_palette"] as const;

/** One palette shared by every open picker, so a colour added in one shows
 * up in the rest straight away. Keyed by user id; the demo keeps its own
 * for the session. */
let shared: { userId: string | null; colors: string[] } = { userId: null, colors: [] };
const listeners = new Set<(colors: string[]) => void>();

function publish(userId: string | null, colors: string[]) {
  shared = { userId, colors };
  for (const l of listeners) l(colors);
}

/** "Your colours" — custom colours the person saved from any icon/colour
 * picker to reuse elsewhere. Stored as lowercase `#rrggbb`. */
export function usePalette() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seeded = shared.userId === userId;
  const [colors, setColors] = useState<string[]>(() => (seeded ? shared.colors : []));

  useEffect(() => {
    if (shared.userId !== userId) publish(userId, []);
  }, [userId]);

  useEffect(() => {
    listeners.add(setColors);
    return () => {
      listeners.delete(setColors);
    };
  }, []);

  const { persist } = useSnapshotCache<{ colors: string[] }>({
    feature: "palette",
    tables: PALETTE_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded,
    fetcher: async () => ({ colors: await fetchPalette() }),
    apply: ({ colors: c }) => publish(userId, c),
    onSettled: () => {},
    onError: () => {},
  });

  const write = useCallback(
    (next: string[]) => {
      const previous = shared.colors;
      publish(userId, next);
      if (isDemo || !userId) return;
      persist({ colors: next });
      savePalette(next).catch((err) => {
        console.error("palette save failed", err);
        publish(userId, previous);
      });
    },
    [userId, isDemo, persist],
  );

  const add = useCallback(
    (hex: string) => {
      const color = hex.toLowerCase();
      if (shared.colors.includes(color)) return;
      write([...shared.colors, color].slice(-PALETTE_LIMIT));
    },
    [write],
  );

  const remove = useCallback((hex: string) => write(shared.colors.filter((c) => c !== hex.toLowerCase())), [write]);

  return { colors, add, remove };
}
