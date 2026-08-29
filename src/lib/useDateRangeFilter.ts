"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filterByDateRange, getDatasetSpan, type DateRange } from "@/lib/aggregations/common";

const STORAGE_KEY = "lauva.analytics.range";

/** The last range picked on any analytics dashboard, so it carries to the
 * next one instead of resetting to "all time" every navigation. Stored as a
 * plain start/end and re-clamped to each dataset's own span on load. */
function readStoredRange(): DateRange | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DateRange>;
    if (typeof parsed.start === "string" && typeof parsed.end === "string") {
      return { start: parsed.start, end: parsed.end };
    }
  } catch {
    // Storage blocked or malformed — fall back to the full span.
  }
  return null;
}

/** Generic over anything date-stamped, so the same range control drives
 * every analytics page (CanonicalEvent-based pages and Workout's
 * RawWorkoutLog alike). */
export function useDateRangeFilter<T extends { date: string }>(events: T[]) {
  const span = useMemo(() => getDatasetSpan(events), [events]);
  const [range, setRangeState] = useState<DateRange | null>(null);

  // Hydrate the last-used range once the span is known, clamped into it.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !span) return;
    hydrated.current = true;
    const stored = readStoredRange();
    if (!stored) return;
    const start = stored.start < span.start ? span.start : stored.start;
    const end = stored.end > span.end ? span.end : stored.end;
    // External-store read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (start <= end) setRangeState({ start, end });
  }, [span]);

  const setRange = useCallback((next: DateRange) => {
    setRangeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked — the range still applies for this session.
    }
  }, []);

  const effectiveRange = range ?? span ?? undefined;
  const filtered = useMemo(() => filterByDateRange(events, effectiveRange ?? undefined), [events, effectiveRange]);

  return { span, range: effectiveRange, setRange, filtered };
}
