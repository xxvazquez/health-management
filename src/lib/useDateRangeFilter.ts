"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDaysToDate, daysBetween, filterByDateRange, getDatasetSpan, type DateRange } from "@/lib/aggregations/common";

const STORAGE_KEY = "lauva.analytics.range.v3";

/** Trends opens on the last 30 days: targets are weekly habits, and a year
 * hides change. */
export const DEFAULT_RANGE_DAYS = 30;

/** What was picked, not the dates it covered then: a rolling window keeps
 * ending at the newest entry, and each dashboard resolves it against its
 * own data. Only a custom span is kept as fixed dates. */
export type RangeChoice = { days: number } | { all: true } | { start: string; end: string };

/** The choice behind a picked range: one ending at the newest entry is a
 * rolling window (the whole span is "all"), anything else a fixed span. */
export function rangeChoiceFrom(next: DateRange, span: DateRange | null): RangeChoice {
  if (span && next.end === span.end) {
    if (next.start > span.start) return { days: daysBetween(next.start, next.end) + 1 };
    if (next.start === span.start) return { all: true };
  }
  return { start: next.start, end: next.end };
}

/** A choice as dates within `span`, or null when a fixed span no longer
 * overlaps the data. */
export function resolveRangeChoice(choice: RangeChoice, span: DateRange): DateRange | null {
  if ("all" in choice) return span;
  if ("days" in choice) {
    const start = addDaysToDate(span.end, -(choice.days - 1));
    return { start: start < span.start ? span.start : start, end: span.end };
  }
  const start = choice.start < span.start ? span.start : choice.start;
  const end = choice.end > span.end ? span.end : choice.end;
  return start <= end ? { start, end } : null;
}

function readStoredChoice(): RangeChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.all === true) return { all: true };
    if (typeof parsed.days === "number" && parsed.days > 0) return { days: parsed.days };
    if (typeof parsed.start === "string" && typeof parsed.end === "string") return { start: parsed.start, end: parsed.end };
  } catch {
    // Storage blocked or malformed — fall back to the default window.
  }
  return null;
}

/** Generic over anything date-stamped, so the same range control drives
 * every analytics page (CanonicalEvent-based pages and Workout's
 * RawWorkoutLog alike). Until a range is picked it shows the last
 * `defaultDays` days, or the whole span when that's omitted. The last pick
 * carries to the next dashboard. */
export function useDateRangeFilter<T extends { date: string }>(events: T[], defaultDays?: number) {
  const span = useMemo(() => getDatasetSpan(events), [events]);
  const [choice, setChoice] = useState<RangeChoice | null>(null);

  useEffect(() => {
    // External-store read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readStoredChoice());
  }, []);

  const setRange = useCallback(
    (next: DateRange) => {
      const picked = rangeChoiceFrom(next, span);
      setChoice(picked);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
      } catch {
        // Storage blocked — the range still applies for this session.
      }
    },
    [span],
  );

  const effectiveRange = useMemo<DateRange | undefined>(() => {
    if (!span) return undefined;
    const picked = choice ? resolveRangeChoice(choice, span) : null;
    if (picked) return picked;
    return defaultDays ? resolveRangeChoice({ days: defaultDays }, span)! : span;
  }, [span, choice, defaultDays]);
  const filtered = useMemo(() => filterByDateRange(events, effectiveRange), [events, effectiveRange]);

  return { span, range: effectiveRange, setRange, filtered };
}
