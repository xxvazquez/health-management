"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  createLabMarker,
  createLabPanel,
  createLabResult,
  createLabResults,
  deleteLabMarker,
  deleteLabPanel,
  deleteLabResult,
  fetchLabMarkers,
  fetchLabPanels,
  updateLabMarker,
  updateLabPanel,
  updateLabResult,
  type LabMarker,
  type LabMarkerPatch,
  type LabPanel,
  type LabPanelPatch,
  type LabResultPatch,
  type NewLabMarkerInput,
  type NewLabResultInput,
} from "@/lib/supabase/labs";
import type { CustomAppearance } from "@/components/ui/customIcons";
import { buildDemoLabMarkers, buildDemoLabPanels } from "@/lib/demoLabs";

/** Module-level cache so the Medical → Results tab keeps one shared
 * lab-results state across client-side navigation — same cross-nav cache
 * pattern as useCareLog. Keyed by user id; cleared on sign-out. */
let cache: { userId: string; panels: LabPanel[]; markers: LabMarker[] } | null = null;

function demoId(prefix: string): string {
  return `demo-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const sortMarkers = (list: LabMarker[]) =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export function useLabs() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [panels, setPanels] = useState<LabPanel[]>(() => seed?.panels ?? buildDemoLabPanels());
  const [markers, setMarkers] = useState<LabMarker[]>(() => seed?.markers ?? buildDemoLabMarkers());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [p, m] = await Promise.all([fetchLabPanels(), fetchLabMarkers()]);
      setPanels(p);
      setMarkers(m);
    } catch (err) {
      console.error("useLabs load failed", err);
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
    if (!loading) cache = { userId, panels, markers };
  }, [userId, isDemo, loading, panels, markers]);

  useEffect(() => {
    if (authLoading || isDemo) return;
    // External read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [authLoading, isDemo, userId, load]);

  // --- Panels ---
  const createPanel = useCallback(
    async (name: string, appearance?: CustomAppearance): Promise<LabPanel> => {
      const sortOrder = panels.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
      if (isDemo) {
        const panel: LabPanel = { id: demoId("panel"), name: name.trim(), sortOrder, icon: appearance?.icon ?? null, color: appearance?.color ?? null };
        setPanels((prev) => [...prev, panel]);
        return panel;
      }
      const created = await createLabPanel(name, sortOrder, appearance);
      setPanels((prev) => [...prev, created]);
      return created;
    },
    [isDemo, panels],
  );

  const renamePanel = useCallback(
    async (id: string, patch: LabPanelPatch) => {
      setPanels((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                name: patch.name !== undefined ? patch.name.trim() : p.name,
                icon: patch.icon !== undefined ? patch.icon : p.icon,
                color: patch.color !== undefined ? patch.color : p.color,
              }
            : p,
        ),
      );
      if (!isDemo) await updateLabPanel(id, patch).catch((err) => console.error("updateLabPanel failed", err));
    },
    [isDemo],
  );

  const removePanel = useCallback(
    async (id: string) => {
      setPanels((prev) => prev.filter((p) => p.id !== id));
      setMarkers((prev) => prev.map((m) => (m.panelId === id ? { ...m, panelId: null } : m)));
      if (!isDemo) await deleteLabPanel(id).catch((err) => console.error("deleteLabPanel failed", err));
    },
    [isDemo],
  );

  // --- Markers ---
  const createMarker = useCallback(
    async (input: Omit<NewLabMarkerInput, "sortOrder">): Promise<LabMarker> => {
      const sortOrder =
        markers.filter((m) => m.panelId === input.panelId).reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1;
      if (isDemo) {
        const marker: LabMarker = {
          id: demoId("marker"),
          panelId: input.panelId,
          name: input.name.trim(),
          unit: input.unit.trim() || null,
          refLow: input.refLow,
          refHigh: input.refHigh,
          sortOrder,
          results: [],
        };
        setMarkers((prev) => sortMarkers([...prev, marker]));
        return marker;
      }
      const created = await createLabMarker({ ...input, sortOrder });
      setMarkers((prev) => sortMarkers([...prev, created]));
      return created;
    },
    [isDemo, markers],
  );

  const editMarker = useCallback(
    async (id: string, patch: LabMarkerPatch) => {
      setMarkers((prev) =>
        sortMarkers(
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  panelId: patch.panelId !== undefined ? patch.panelId : m.panelId,
                  name: patch.name !== undefined ? patch.name.trim() : m.name,
                  unit: patch.unit !== undefined ? patch.unit.trim() || null : m.unit,
                  refLow: patch.refLow !== undefined ? patch.refLow : m.refLow,
                  refHigh: patch.refHigh !== undefined ? patch.refHigh : m.refHigh,
                  sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : m.sortOrder,
                }
              : m,
          ),
        ),
      );
      if (!isDemo) {
        const updated = await updateLabMarker(id, patch);
        setMarkers((prev) => sortMarkers(prev.map((m) => (m.id === id ? updated : m))));
      }
    },
    [isDemo],
  );

  const removeMarker = useCallback(
    async (id: string) => {
      setMarkers((prev) => prev.filter((m) => m.id !== id));
      if (!isDemo) await deleteLabMarker(id).catch((err) => console.error("deleteLabMarker failed", err));
    },
    [isDemo],
  );

  // --- Results ---
  const sortResults = (list: LabMarker["results"]) => [...list].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));

  const addResult = useCallback(
    async (input: NewLabResultInput) => {
      if (isDemo) {
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === input.markerId
              ? {
                  ...m,
                  results: sortResults([
                    ...m.results,
                    {
                      id: demoId("result"),
                      markerId: m.id,
                      measuredOn: input.measuredOn,
                      value: input.value,
                      lab: input.lab.trim() || null,
                      note: input.note.trim() || null,
                    },
                  ]),
                }
              : m,
          ),
        );
        return;
      }
      const created = await createLabResult(input);
      setMarkers((prev) =>
        prev.map((m) => (m.id === input.markerId ? { ...m, results: sortResults([...m.results, created]) } : m)),
      );
    },
    [isDemo],
  );

  const addManyResults = useCallback(
    async (inputs: NewLabResultInput[]) => {
      if (inputs.length === 0) return;
      if (isDemo) {
        setMarkers((prev) =>
          prev.map((m) => {
            const mine = inputs.filter((i) => i.markerId === m.id);
            if (mine.length === 0) return m;
            return {
              ...m,
              results: sortResults([
                ...m.results,
                ...mine.map((input) => ({
                  id: demoId("result"),
                  markerId: m.id,
                  measuredOn: input.measuredOn,
                  value: input.value,
                  lab: input.lab.trim() || null,
                  note: input.note.trim() || null,
                })),
              ]),
            };
          }),
        );
        return;
      }
      const created = await createLabResults(inputs);
      const byMarker = new Map<string, typeof created>();
      for (const r of created) byMarker.set(r.markerId, [...(byMarker.get(r.markerId) ?? []), r]);
      setMarkers((prev) =>
        prev.map((m) => {
          const add = byMarker.get(m.id);
          return add ? { ...m, results: sortResults([...m.results, ...add]) } : m;
        }),
      );
    },
    [isDemo],
  );

  const editResult = useCallback(
    async (markerId: string, id: string, patch: LabResultPatch) => {
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === markerId
            ? {
                ...m,
                results: sortResults(
                  m.results.map((r) =>
                    r.id === id
                      ? {
                          ...r,
                          measuredOn: patch.measuredOn ?? r.measuredOn,
                          value: patch.value ?? r.value,
                          lab: patch.lab !== undefined ? patch.lab.trim() || null : r.lab,
                          note: patch.note !== undefined ? patch.note.trim() || null : r.note,
                        }
                      : r,
                  ),
                ),
              }
            : m,
        ),
      );
      if (!isDemo) {
        const updated = await updateLabResult(id, patch);
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === markerId ? { ...m, results: sortResults(m.results.map((r) => (r.id === id ? updated : r))) } : m,
          ),
        );
      }
    },
    [isDemo],
  );

  const removeResult = useCallback(
    async (markerId: string, id: string) => {
      setMarkers((prev) => prev.map((m) => (m.id === markerId ? { ...m, results: m.results.filter((r) => r.id !== id) } : m)));
      if (!isDemo) await deleteLabResult(id).catch((err) => console.error("deleteLabResult failed", err));
    },
    [isDemo],
  );

  return {
    isDemo,
    loading: !isDemo && loading,
    error,
    panels: { data: panels, create: createPanel, rename: renamePanel, remove: removePanel },
    markers: { data: markers, create: createMarker, edit: editMarker, remove: removeMarker },
    results: { add: addResult, addMany: addManyResults, edit: editResult, remove: removeResult },
  };
}
