"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceCardGrid } from "@/components/analytics/AdherenceCardGrid";
import { useItemActions } from "@/lib/useItemActions";
import { supplementStats } from "@/lib/aggregations/supplements";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export function SupplementsDashboard() {
  const { status, events, refresh } = useData();
  const { busyIdentity, toggleArchive, rename } = useItemActions(refresh);

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
      <DashboardHeader>Supplements</DashboardHeader>

      <AdherenceCardGrid
        stats={stats}
        events={events}
        accent={TYPE_ACCENT.supplement}
        noun="supplement"
        busyIdentity={busyIdentity}
        onArchiveToggle={(item) => void toggleArchive(item)}
        onRename={(item, name) => void rename(item, name)}
      />

      <Methodology>
        A day counts as tracked once the supplement has been logged at least once, through to today; gaps count as
        misses, days before the first log don&apos;t. Consistency is completed days over tracked days — never a
        fixed target, and never a recommendation to take more or less of anything. Archiving only hides a
        supplement from new logging; its history stays in every view here.
      </Methodology>
    </div>
  );
}
