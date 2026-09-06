"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { supplementsAtAGlance, supplementStatsRanked, supplementsInsight } from "@/lib/aggregations/supplements";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STRIP_WINDOW_DAYS = 90;

export function SupplementsDashboard() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);

  const insight = useMemo(() => supplementsInsight(events), [events]);
  const glance = useMemo(() => supplementsAtAGlance(events), [events]);
  // Fiber is logged here but tracked for its digestive relevance — its
  // stats live on the Stool dashboard (`supplementStatsRanked` drops it).
  const ranked = useMemo(() => supplementStatsRanked(filtered), [filtered]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader>Supplements</DashboardHeader>

      {span && range && (
        <div className="flex justify-end">
          <DateRangeFilter span={span} value={range} onChange={setRange} accent={TYPE_ACCENT.supplement} />
        </div>
      )}

      {glance.trackedCount > 0 && (
        <div
          className={`grid grid-cols-2 gap-3 ${glance.increasedCount > 0 || glance.decreasedCount > 0 ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}
        >
          <StatTile
            label="Average consistency"
            value={glance.avgConsistencyPct !== null ? `${Math.round(glance.avgConsistencyPct)}%` : "—"}
            detail={`across ${glance.trackedCount} tracked`}
            accent={TYPE_ACCENT.supplement}
          />
          <StatTile label="Tracked" value={String(glance.trackedCount)} detail={glance.trackedCount === 1 ? "supplement" : "supplements"} />
          {(glance.increasedCount > 0 || glance.decreasedCount > 0) && (
            <>
              <StatTile label="Running above usual" value={String(glance.increasedCount)} detail="last 14 tracked days" />
              <StatTile label="Running below usual" value={String(glance.decreasedCount)} detail="last 14 tracked days" />
            </>
          )}
        </div>
      )}

      <Insight label="What stands out" headline={insight.headline} detail={insight.detail} tone="neutral" />

      {!insight.insufficientData && insight.changed.length > 0 && (
        <BulletList title="Running differently than usual" tone="var(--text-muted)" bullets={insight.changed} />
      )}

      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Every supplement, biggest change first
      </p>

      {ranked.length > 0 && (
        <Card tier="raw">
          <div className="flex flex-col">
            {ranked.map((item) => (
              <div
                key={item.item}
                className="flex flex-col gap-2 border-b py-3.5 first:pt-0 last:border-0 last:pb-0"
                style={{ borderColor: "var(--gridline)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {item.item}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {item.category}
                    </span>
                    {item.shiftPp !== null && Math.abs(item.shiftPp) >= 15 && (
                      <span
                        className="text-xs font-medium tabular-nums"
                        style={{ color: item.shiftPp > 0 ? "var(--status-good)" : "var(--status-warning)" }}
                      >
                        {item.shiftPp > 0 ? "▲" : "▼"} {Math.abs(item.shiftPp)}pp vs usual
                      </span>
                    )}
                  </span>
                  <span className="flex gap-4 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.consistencyPct}%</strong> consistency
                    </span>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.currentStreak}</strong> current streak
                    </span>
                    <span>
                      {item.daysCompleted}/{item.daysTracked} days tracked
                    </span>
                  </span>
                </div>
                {clampedStripStart && (
                  <AdherenceStrip startDate={clampedStripStart} endDate={stripEnd} stateByDate={buildStateByDate(filtered, item.item)} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Methodology>
        This compares each supplement&apos;s consistency over the last 14 tracked days against its own overall
        consistency since it was first logged — never a fixed target, never a recommendation to take more or less
        of anything, and never ranked against a different supplement&apos;s consistency. A supplement needs at
        least 10 overall tracked days and 5 recent tracked days before it&apos;s described either way.
      </Methodology>
    </div>
  );
}
