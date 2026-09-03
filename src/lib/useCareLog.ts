"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  createCareEntry,
  deleteCareEntry,
  fetchCareEntries,
  updateCareEntry,
  type CareEntry,
  type CareEntryPatch,
  type NewCareEntryInput,
} from "@/lib/supabase/careLog";
import { buildDemoCareEntries } from "@/lib/demoCareLog";

/** Standalone so both the Medical page (via useDoctors) and the Log page's
 * Symptoms tab read one shared care-log state. Survives navigation away and
 * back — same cross-nav cache pattern as useDoctors; keyed by user id,
 * cleared on sign-out. */
let cache: { userId: string; entries: CareEntry[] } | null = null;

function demoId(prefix: string): string {
  return `demo-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const sortEntries = (list: CareEntry[]) =>
  [...list].sort((a, b) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt));

export function useCareLog() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [entries, setEntries] = useState<CareEntry[]>(() => seed?.entries ?? buildDemoCareEntries());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setEntries(await fetchCareEntries());
    } catch (err) {
      console.error("useCareLog load failed", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) cache = { userId, entries };
  }, [userId, isDemo, loading, entries]);

  useEffect(() => {
    if (authLoading || isDemo) return;
    // External read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [authLoading, isDemo, userId, load]);

  const add = useCallback(
    async (input: NewCareEntryInput) => {
      if (isDemo) {
        setEntries((prev) =>
          sortEntries([
            {
              id: demoId("care"),
              happenedOn: input.happenedOn,
              kind: input.kind,
              title: input.title.trim(),
              body: input.body.trim() || null,
              specialtyIds: input.specialtyIds,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]),
        );
        return;
      }
      const created = await createCareEntry(input);
      setEntries((prev) => sortEntries([created, ...prev]));
    },
    [isDemo],
  );

  const edit = useCallback(
    async (id: string, patch: CareEntryPatch) => {
      setEntries((prev) =>
        sortEntries(
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  happenedOn: patch.happenedOn ?? e.happenedOn,
                  kind: patch.kind ?? e.kind,
                  title: patch.title !== undefined ? patch.title.trim() : e.title,
                  body: patch.body !== undefined ? patch.body.trim() || null : e.body,
                  specialtyIds: patch.specialtyIds ?? e.specialtyIds,
                }
              : e,
          ),
        ),
      );
      if (!isDemo) {
        const updated = await updateCareEntry(id, patch);
        setEntries((prev) => sortEntries(prev.map((e) => (e.id === id ? updated : e))));
      }
    },
    [isDemo],
  );

  const remove = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (!isDemo) await deleteCareEntry(id).catch((err) => console.error("deleteCareEntry failed", err));
    },
    [isDemo],
  );

  return { data: entries, loading: !isDemo && loading, error, isDemo, add, edit, remove };
}
