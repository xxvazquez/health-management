"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceCardGrid } from "@/components/analytics/AdherenceCardGrid";
import { habitStats } from "@/lib/aggregations/habits";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export function HabitsDashboard() {
  const { status, events } = useData();
  const stats = useMemo(() => habitStats(events), [events]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader
        subtitle={
          <>
            Consistency for every habit you&apos;ve logged — head to the{" "}
            <Link href="/log" className="underline" style={{ color: "var(--series-1)" }}>
              Log page
            </Link>{" "}
            to check one off, or{" "}
            <Link href="/manage" className="underline" style={{ color: "var(--series-1)" }}>
              Settings
            </Link>{" "}
            to add, rename, or archive habits.
          </>
        }
      >
        Habits
      </DashboardHeader>

      <AdherenceCardGrid stats={stats} events={events} accent={TYPE_ACCENT.habit} noun="habit" />

      <Methodology>
        A day counts as tracked once the habit has been logged at least once, through to today; gaps count as
        misses, days before the first log don&apos;t. Consistency is completed days over tracked days; the streak
        is consecutive tracked days completed. Archiving only hides a habit from new logging — its history stays
        in every view here.
      </Methodology>
    </div>
  );
}
