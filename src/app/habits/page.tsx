"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { habitsByCategory, habitStats } from "@/lib/aggregations/habits";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STRIP_WINDOW_DAYS = 90;

export default function HabitsPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);

  const groups = useMemo(() => habitsByCategory(filtered), [filtered]);
  const all = useMemo(() => habitStats(filtered), [filtered]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  const avgConsistency = all.length > 0 ? Math.round((all.reduce((s, i) => s + i.consistencyPct, 0) / all.length) * 10) / 10 : 0;
  const mostConsistent = [...all].sort((a, b) => b.consistencyPct - a.consistencyPct)[0];
  const longestStreak = [...all].sort((a, b) => b.longestStreak - a.longestStreak)[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Habits
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Non-food behaviors — sleep, movement, meal timing, fasting, self-care, and more.
          </p>
        </div>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Habits tracked" value={String(all.length)} accent={TYPE_ACCENT.habit} />
        <StatTile label="Average consistency" value={`${avgConsistency}%`} accent={TYPE_ACCENT.habit} />
        <StatTile
          label="Most consistent"
          value={mostConsistent?.item ?? "—"}
          detail={mostConsistent ? `${mostConsistent.consistencyPct}%` : undefined}
        />
        <StatTile
          label="Longest streak"
          value={longestStreak ? `${longestStreak.longestStreak} days` : "—"}
          detail={longestStreak?.item}
        />
      </div>

      {groups.map((group) => (
        <Card key={group.category}>
          <CardTitle subtitle={`${group.items.length} item${group.items.length === 1 ? "" : "s"}`}>
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
    </div>
  );
}
