"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceCardGrid } from "@/components/analytics/AdherenceCardGrid";
import { useItemActions } from "@/lib/useItemActions";
import { habitStats } from "@/lib/aggregations/habits";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export function HabitsDashboard() {
  const { status, events, refresh } = useData();
  const { busyIdentity, toggleArchive, rename } = useItemActions(refresh);
  const stats = useMemo(() => habitStats(events), [events]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader>Habits</DashboardHeader>

      <AdherenceCardGrid
        stats={stats}
        events={events}
        accent={TYPE_ACCENT.habit}
        noun="habit"
        busyIdentity={busyIdentity}
        onArchiveToggle={(item) => void toggleArchive(item)}
        onRename={(item, name) => void rename(item, name)}
      />

      <Methodology>
        A day counts as tracked once the habit has been logged at least once, through to today; gaps count as
        misses, days before the first log don&apos;t. Consistency is completed days over tracked days; the streak
        is consecutive tracked days completed. Archiving only hides a habit from new logging — its history stays
        in every view here.
      </Methodology>
    </div>
  );
}
