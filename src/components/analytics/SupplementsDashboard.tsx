"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { usePreferences } from "@/lib/usePreferences";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceCardGrid } from "@/components/analytics/AdherenceCardGrid";
import { supplementStats } from "@/lib/aggregations/supplements";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export function SupplementsDashboard() {
  const { status, events } = useData();
  const { prefs } = usePreferences();

  // Fiber is logged here but tracked for its digestive relevance — its
  // stats live on the Stool dashboard.
  const stats = useMemo(
    () => supplementStats(events.filter((e) => !(e.itemType === "supplement" && e.category === "Fiber"))),
    [events],
  );

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <AdherenceCardGrid stats={stats} events={events} accent={TYPE_ACCENT.supplement} noun="supplement" schedules={prefs.itemSchedules} />

      <Methodology>
        A day counts once the supplement has been logged at least once, through to today — or, for an archived
        supplement, to its last log. Consistency is measured against its schedule (Settings → the supplement →
        Schedule): every day by default, a set number of times a week, or specific weekdays, where days off the
        schedule never count as misses. Archiving hides it from new logging; its history stays here.
      </Methodology>
    </div>
  );
}
