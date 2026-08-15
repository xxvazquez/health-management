"use client";

import { useMemo, useState } from "react";
import type { CanonicalEvent } from "@/lib/types";
import { filterByDateRange, getDatasetSpan, type DateRange } from "@/lib/aggregations/common";

export function useDateRangeFilter(events: CanonicalEvent[]) {
  const span = useMemo(() => getDatasetSpan(events), [events]);
  const [range, setRange] = useState<DateRange | null>(null);

  const effectiveRange = range ?? span ?? undefined;
  const filtered = useMemo(() => filterByDateRange(events, effectiveRange ?? undefined), [events, effectiveRange]);

  return { span, range: effectiveRange, setRange, filtered };
}
