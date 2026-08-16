"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { computeOverviewStats, computeOverviewInsight } from "@/lib/aggregations/overview";
import { TYPE_ACCENT } from "@/taxonomy/categories";

export default function OverviewPage() {
  const { status, events, unclassifiedItems, archivedItems } = useData();

  const stats = useMemo(() => (events.length > 0 ? computeOverviewStats(events) : null), [events]);
  const insight = useMemo(() => computeOverviewInsight(events), [events]);

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
      </div>

      <Insight label="Overall" headline={insight.headline} detail={insight.detail} tone={insight.tone} />

      {!insight.insufficientData && (insight.whatMatters.length > 0 || insight.needsAttention.length > 0) && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <BulletList title="What matters" tone="var(--status-good)" bullets={insight.whatMatters} emptyText="Not enough food data yet to say what's well covered." />
          <BulletList title="Needs attention" tone="var(--status-warning)" bullets={insight.needsAttention} emptyText="No standout gaps against established food-group guidance right now." />
        </div>
      )}

      {!insight.insufficientData && insight.whatChanged.length > 0 && (
        <BulletList title="What changed" tone="var(--text-muted)" bullets={insight.whatChanged} />
      )}

      <div>
        <p className="mb-3 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          At a glance
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Food categories tracked"
            value={`${stats.food.categoriesTracked} / ${stats.food.totalFoodCategories}`}
            accent={TYPE_ACCENT.food}
          />
          <StatTile label="Unique foods" value={String(stats.food.uniqueFoods)} accent={TYPE_ACCENT.food} />
          <StatTile
            label="Supplement consistency"
            value={`${stats.supplements.averageConsistencyPct}%`}
            detail={`avg across ${stats.supplements.count} tracked`}
            accent={TYPE_ACCENT.supplement}
          />
          <StatTile
            label="Habit consistency"
            value={`${stats.habits.averageConsistencyPct}%`}
            detail={`avg across ${stats.habits.count} tracked`}
            accent={TYPE_ACCENT.habit}
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
            detail="of tracked days"
            accent={TYPE_ACCENT.outcome}
          />
          <StatTile
            label="Tracking coverage"
            value={`${stats.trackingCoverage.coveragePct}%`}
            detail={`${stats.trackingCoverage.trackedDays} of ${stats.trackingCoverage.totalCalendarDays} days`}
          />
          <StatTile
            label="Most tracked food"
            value={stats.food.topFood?.item ?? "—"}
            detail={stats.food.topFood ? `${stats.food.topFood.count} days` : undefined}
            accent={TYPE_ACCENT.food}
          />
        </div>
      </div>

      {(unclassifiedItems.length > 0 || archivedItems.length > 0) && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Data-quality notes — nothing here affects your logged history, only how it's grouped and displayed">
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
                      className="rounded-full px-2.5 py-1 text-xs whitespace-nowrap"
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
                      className="rounded-full px-2.5 py-1 text-xs whitespace-nowrap"
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
