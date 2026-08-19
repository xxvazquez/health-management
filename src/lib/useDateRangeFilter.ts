"use client";

import { useMemo, useState } from "react";
import { filterByDateRange, getDatasetSpan, type DateRange } from "@/lib/aggregations/common";

/** Generic over anything date-stamped, so the same range-filter panel and
 * preset list drives every analytics page (CanonicalEvent-based pages and
 * Gym's RawGymLog alike). */
export function useDateRangeFilter<T extends { date: string }>(events: T[]) {
  const span = useMemo(() => getDatasetSpan(events), [events]);
  const [range, setRange] = useState<DateRange | null>(null);

  const effectiveRange = range ?? span ?? undefined;
  const filtered = useMemo(() => filterByDateRange(events, effectiveRange ?? undefined), [events, effectiveRange]);

  return { span, range: effectiveRange, setRange, filtered };
}
