"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { demoSupplementItems } from "@/lib/demoData";
import { getAllItems } from "@/lib/db/indexedDb";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** {id, name} for the account's non-archived supplement items — the option
 * list for a decision entry's "which supplement" picker. */
export interface SupplementOption {
  id: string;
  name: string;
}

/** Standalone so both the Medical page (via useDoctors) and the Log page's
 * Symptoms tab read one shared care-log state. Survives navigation away and
 * back — same cross-nav cache pattern as useDoctors; keyed by user id,
 * cleared on sign-out. */
let cache: { userId: string; entries: CareEntry[] } | null = null;

const CARE_LOG_TABLES = ["care_entries", "care_entry_specialties"] as const;

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
  const [fetchedSupplements, setFetchedSupplements] = useState<SupplementOption[]>([]);
  const supplements = useMemo(
    () => (isDemo ? demoSupplementItems() : fetchedSupplements),
    [isDemo, fetchedSupplements],
  );

  useEffect(() => {
    if (isDemo || !userId) return;
    let active = true;
    getAllItems()
      .then((items) => {
        if (!active) return;
        setFetchedSupplements(
          items
            .filter((i) => i.itemType === "supplement" && !i.isArchived)
            .map((i) => ({ id: i.identity, name: i.rawName }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isDemo, userId]);

  const { persist } = useSnapshotCache<CareEntry[]>({
    feature: "careLog",
    tables: CARE_LOG_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: fetchCareEntries,
    apply: (list) => {
      setEntries(sortEntries(list));
      setError(false);
    },
    onSettled: () => setLoading(false),
    onError: () => setError(true),
  });

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) {
      cache = { userId, entries };
      persist(entries);
    }
  }, [userId, isDemo, loading, entries, persist]);

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
              remindOn: input.remindOn,
              supplementItemId: input.kind === "decision" ? input.supplementItemId : null,
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
      const current = entries.find((e) => e.id === id);
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
                  remindOn: patch.remindOn !== undefined ? patch.remindOn : e.remindOn,
                  supplementItemId: patch.supplementItemId !== undefined ? patch.supplementItemId : e.supplementItemId,
                  specialtyIds: patch.specialtyIds ?? e.specialtyIds,
                }
              : e,
          ),
        ),
      );
      if (!isDemo && current) {
        const updated = await updateCareEntry(current, patch);
        setEntries((prev) => sortEntries(prev.map((e) => (e.id === id ? updated : e))));
      }
    },
    [isDemo, entries],
  );

  const remove = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (!isDemo) await deleteCareEntry(id).catch((err) => console.error("deleteCareEntry failed", err));
    },
    [isDemo],
  );

  return { data: entries, supplements, loading: !isDemo && loading, error, isDemo, add, edit, remove };
}
