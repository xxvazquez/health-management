"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DonutChart } from "@/components/charts/DonutChart";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { computeOverviewStats } from "@/lib/aggregations/overview";
import { foodVarietyOverTime } from "@/lib/aggregations/food";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export default function OverviewPage() {
  const { status, events, unclassifiedItems, archivedItems } = useData();

  const stats = useMemo(() => (events.length > 0 ? computeOverviewStats(events) : null), [events]);
  const variety = useMemo(() => foodVarietyOverTime(events), [events]);
  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      if (!e.completed) continue;
      counts.set(e.itemType, (counts.get(e.itemType) ?? 0) + 1);
    }
    const labels: Record<string, string> = {
      food: "Food",
      supplement: "Supplements",
      outcome: "Symptoms / Outcomes",
      habit: "Habits",
    };
    return Array.from(counts.entries()).map(([itemType, value]) => ({
      label: labels[itemType] ?? itemType,
      value,
      color: TYPE_ACCENT[itemType as keyof typeof TYPE_ACCENT],
    }));
  }, [events]);

  if (status === "loading") {
    return <p style={{ color: "var(--text-muted)" }}>Loading your data…</p>;
  }
  if (status === "empty" || !stats) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Overview
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {stats.dateRange
            ? `Tracking from ${stats.dateRange.start} to ${stats.dateRange.end} — ${stats.trackingCoverage.trackedDays} of ${stats.trackingCoverage.totalCalendarDays} calendar days have at least one entry (${stats.trackingCoverage.coveragePct}% coverage).`
            : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="Food categories tracked"
          value={`${stats.food.categoriesTracked} / ${stats.food.totalFoodCategories}`}
          accent={TYPE_ACCENT.food}
        />
        <StatTile label="Unique foods" value={String(stats.food.uniqueFoods)} accent={TYPE_ACCENT.food} />
        <StatTile
          label="Most tracked food"
          value={stats.food.topFood?.item ?? "—"}
          detail={stats.food.topFood ? `${stats.food.topFood.count} days` : undefined}
          accent={TYPE_ACCENT.food}
        />
        <StatTile
          label="Supplement consistency"
          value={`${stats.supplements.averageConsistencyPct}%`}
          detail={`avg across ${stats.supplements.count} tracked supplements`}
          accent={TYPE_ACCENT.supplement}
        />
        <StatTile
          label="Most common Bristol type"
          value={stats.digestion.mostCommonBristol?.item ?? "—"}
          detail={stats.digestion.mostCommonBristol ? `${stats.digestion.mostCommonBristol.sharePct}% of logged days` : undefined}
          accent={TYPE_ACCENT.outcome}
        />
        <StatTile
          label="Digestive symptom frequency"
          value={`${stats.digestion.digestiveSymptomDaysPct}%`}
          detail="of tracked days had a digestive symptom logged"
          accent={TYPE_ACCENT.outcome}
        />
        <StatTile
          label="Habit consistency"
          value={`${stats.habits.averageConsistencyPct}%`}
          detail={`avg across ${stats.habits.count} tracked habits`}
          accent={TYPE_ACCENT.habit}
        />
        <StatTile
          label="Tracking coverage"
          value={`${stats.trackingCoverage.coveragePct}%`}
          detail={`${stats.trackingCoverage.trackedDays} of ${stats.trackingCoverage.totalCalendarDays} days`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Share of all completed tracked entries, by type">What you&apos;re tracking</CardTitle>
          {typeBreakdown.length > 0 ? <DonutChart data={typeBreakdown} /> : <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data yet.</p>}
        </Card>
        <Card>
          <CardTitle subtitle="Rolling 7-day count of distinct foods eaten — a descriptive variety metric, not a health verdict">
            Food variety over time
          </CardTitle>
          {variety.length > 0 ? (
            <TrendAreaChart
              data={variety.map((v) => ({ date: v.date, value: v.rolling7dUniqueFoods }))}
              color={TYPE_ACCENT.food}
              valueLabel="Unique foods (7d)"
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No food data yet.</p>
          )}
        </Card>
      </div>

      {(unclassifiedItems.length > 0 || archivedItems.length > 0) && (
        <Card>
          <CardTitle subtitle="Data-quality notes — nothing here affects your logged history, only how it's grouped and displayed">
            Needs a closer look
          </CardTitle>
          <div className="flex flex-col gap-4">
            {unclassifiedItems.length > 0 && (
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {unclassifiedItems.length} item{unclassifiedItems.length === 1 ? "" : "s"} filed under Habits by
                  default
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  These raw names didn&apos;t match any known food/supplement/symptom pattern, so they defaulted to
                  Habits → Other. Add an entry for each to <code>src/taxonomy/overrides.json</code> to reclassify.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unclassifiedItems.map((name) => (
                    <span
                      key={name}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {archivedItems.length > 0 && (
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {archivedItems.length} item{archivedItems.length === 1 ? "" : "s"} archived from dashboards
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Habits/supplements explicitly marked discontinued, or with no activity for 90+ days — excluded
                  from every dashboard above, still fully in your Supabase history.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {archivedItems.map((a) => (
                    <span
                      key={a.item}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
                      title={`Last tracked ${a.lastTrackedDate}`}
                    >
                      {a.item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
