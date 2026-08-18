"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { supplementsAtAGlance, supplementsByCategory, supplementsInsight } from "@/lib/aggregations/supplements";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STRIP_WINDOW_DAYS = 90;

export default function SupplementsPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);

  // Fiber is logged here (it's something taken, not an outcome) but tracked
  // for its digestive relevance — its stats live on the Digestion page
  // instead of cluttering the general supplement-adherence view here.
  const filteredNoFiber = useMemo(
    () => filtered.filter((e) => !(e.itemType === "supplement" && e.category === "Fiber")),
    [filtered],
  );
  const insight = useMemo(() => supplementsInsight(events), [events]);
  const glance = useMemo(() => supplementsAtAGlance(events), [events]);
  const groups = useMemo(() => supplementsByCategory(filteredNoFiber), [filteredNoFiber]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <h1 className="text-xl font-semibold tracking-tight lg:col-span-2" style={{ color: "var(--text-primary)" }}>
        Supplements
      </h1>

      {glance.trackedCount > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
          <StatTile
            label="Average consistency"
            value={glance.avgConsistencyPct !== null ? `${Math.round(glance.avgConsistencyPct)}%` : "—"}
            detail={`across ${glance.trackedCount} tracked`}
            accent={TYPE_ACCENT.supplement}
          />
          <StatTile label="Tracked" value={String(glance.trackedCount)} detail={glance.trackedCount === 1 ? "supplement" : "supplements"} />
          <StatTile label="Running above usual" value={String(glance.increasedCount)} detail="last 14 tracked days" />
          <StatTile label="Running below usual" value={String(glance.decreasedCount)} detail="last 14 tracked days" />
        </div>
      )}

      <Insight label="What changed" headline={insight.headline} detail={insight.detail} tone="neutral" />

      {!insight.insufficientData && insight.changed.length > 0 && (
        <BulletList title="Running differently than usual" tone="var(--text-muted)" bullets={insight.changed} />
      )}

      <div className="flex items-center justify-between gap-3 lg:col-span-2">
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Details
        </p>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      {groups.map((group) => (
        <Card key={group.category} tier="raw">
          <CardTitle size="sm" subtitle={`${group.items.length} item${group.items.length === 1 ? "" : "s"}`}>
            {group.category}
          </CardTitle>
          <div className="flex flex-col gap-4">
            {group.items.map((item) => (
              <div key={item.item} className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0" style={{ borderColor: "var(--gridline)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {item.item}
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
                  <AdherenceStrip
                    startDate={clampedStripStart}
                    endDate={stripEnd}
                    stateByDate={buildStateByDate(filtered, item.item)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Methodology className="lg:col-span-2">
        This compares each supplement&apos;s consistency over the last 14 tracked days against its own overall
        consistency since it was first logged — never a fixed target, never a recommendation to take more or less
        of anything, and never ranked against a different supplement&apos;s consistency. A supplement needs at
        least 10 overall tracked days and 5 recent tracked days before it&apos;s described either way.
      </Methodology>
    </div>
  );
}
