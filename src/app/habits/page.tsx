"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { habitsByCategory, habitsInsight } from "@/lib/aggregations/habits";

const STRIP_WINDOW_DAYS = 90;

export default function HabitsPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);

  // The insight always reads the full history (recent-vs-usual needs a
  // stable baseline) — independent of whatever range the detail charts
  // below are filtered to.
  const insight = useMemo(() => habitsInsight(events), [events]);
  const groups = useMemo(() => habitsByCategory(filtered), [filtered]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Habits
      </h1>

      <Insight label="What changed" headline={insight.headline} detail={insight.detail} tone="neutral" />

      {!insight.insufficientData && insight.changed.length > 0 && (
        <BulletList title="Running differently than usual" tone="var(--text-muted)" bullets={insight.changed} />
      )}

      <div className="flex items-center justify-between gap-3">
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
                      <strong style={{ color: "var(--text-primary)" }}>{item.longestStreak}</strong> longest streak
                    </span>
                    <span>
                      {item.daysCompleted}/{item.daysTracked} days
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

      <Methodology>
        This compares each habit&apos;s consistency over the last 14 tracked days against its own overall
        consistency since it was first logged — never a fixed target, and never a judgment of whether that&apos;s
        good. A habit needs at least 10 overall tracked days and 5 recent tracked days before it&apos;s described
        either way; below that it&apos;s left out rather than guessed at.
      </Methodology>
    </div>
  );
}
