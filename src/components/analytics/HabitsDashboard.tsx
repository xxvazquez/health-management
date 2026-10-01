"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { usePreferences } from "@/lib/usePreferences";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceCardGrid } from "@/components/analytics/AdherenceCardGrid";
import { habitStats } from "@/lib/aggregations/habits";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export function HabitsDashboard() {
  const { status, events } = useData();
  const { prefs } = usePreferences();
  const stats = useMemo(() => habitStats(events), [events]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <AdherenceCardGrid stats={stats} events={events} accent={TYPE_ACCENT.habit} noun="habit" schedules={prefs.itemSchedules} />

      <Methodology>
        A day counts once the habit has been logged at least once, through to today — or, for an archived
        habit, to its last log. Consistency is measured against its schedule (Settings → the habit →
        Schedule): every day by default, a set number of times a week, or specific weekdays, where days off the
        schedule never count as misses. Archiving hides it from new logging; its history stays here.
      </Methodology>
    </div>
  );
}
