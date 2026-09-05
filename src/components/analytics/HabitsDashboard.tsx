"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { Methodology } from "@/components/ui/Methodology";
import { StatTile } from "@/components/ui/StatTile";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { habitsAtAGlance, habitsByCategory, habitsInsight, habitStats } from "@/lib/aggregations/habits";
import { useItemActions } from "@/lib/useItemActions";
import { ItemActions } from "@/components/ui/ItemActions";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STRIP_WINDOW_DAYS = 90;

export function HabitsDashboard() {
  const { status, events, refresh } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const { busyIdentity, toggleArchive, rename } = useItemActions(refresh);

  // The insight always reads the full history (recent-vs-usual needs a
  // stable baseline) — independent of whatever range the detail charts
  // below are filtered to.
  const insight = useMemo(() => habitsInsight(events), [events]);
  const glance = useMemo(() => habitsAtAGlance(events), [events]);
  const allStats = useMemo(() => habitStats(filtered), [filtered]);
  const groups = useMemo(
    () =>
      habitsByCategory(filtered)
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.isArchived) }))
        .filter((g) => g.items.length > 0),
    [filtered],
  );
  const archived = useMemo(() => allStats.filter((i) => i.isArchived), [allStats]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <DashboardHeader accent="var(--series-3)" className="lg:col-span-2">
        Habits
      </DashboardHeader>

      {glance.trackedCount > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
          <StatTile
            label="Average consistency"
            value={glance.avgConsistencyPct !== null ? `${Math.round(glance.avgConsistencyPct)}%` : "—"}
            detail={`across ${glance.trackedCount} tracked`}
            accent={TYPE_ACCENT.habit}
          />
          <StatTile label="Tracked" value={String(glance.trackedCount)} detail={glance.trackedCount === 1 ? "habit" : "habits"} />
          <StatTile label="Running above usual" value={String(glance.increasedCount)} detail="last 14 tracked days" />
          <StatTile label="Running below usual" value={String(glance.decreasedCount)} detail="last 14 tracked days" />
        </div>
      )}

      <Insight label="What stands out" headline={insight.headline} detail={insight.detail} tone="neutral" />

      {!insight.insufficientData && insight.changed.length > 0 && (
        <BulletList title="Running differently than usual" tone="var(--text-muted)" bullets={insight.changed} />
      )}

      <div className="flex items-center justify-between gap-3 lg:col-span-2">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Details
        </p>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} accent={TYPE_ACCENT.habit} />}
      </div>

      {groups.map((group) => (
        <Card key={group.category} tier="raw">
          <CardTitle size="sm" subtitle={`${group.items.length} item${group.items.length === 1 ? "" : "s"}`}>
            {group.category}
          </CardTitle>
          <div className="flex flex-col gap-4">
            {group.items.map((item) => (
              <div
                key={item.itemIdentity}
                className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0"
                style={{ borderColor: "var(--gridline)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <ItemActions
                    item={item}
                    busy={busyIdentity === item.itemIdentity}
                    onArchiveToggle={() => void toggleArchive(item)}
                    onRename={(newName) => void rename(item, newName)}
                  />
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

      {archived.length > 0 && (
        <Card tier="raw" className="lg:col-span-2">
          <Disclosure label="Archived" count={archived.length}>
            <ul className="mt-3 flex flex-col gap-2">
              {archived.map((item) => (
                <li
                  key={item.itemIdentity}
                  className="flex items-center justify-between gap-2 border-t pt-2 text-sm"
                  style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
                >
                  {item.item}
                  <button
                    type="button"
                    onClick={() => void toggleArchive(item)}
                    disabled={busyIdentity === item.itemIdentity}
                    className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Unarchive
                  </button>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Card>
      )}

      <Methodology className="lg:col-span-2">
        This compares each habit&apos;s consistency over the last 14 tracked days against its own overall
        consistency since it was first logged — never a fixed target, and never a judgment of whether that&apos;s
        good. A habit needs at least 10 overall tracked days and 5 recent tracked days before it&apos;s described
        either way; below that it&apos;s left out rather than guessed at. Archiving a habit only hides it from new
        logging — its full history stays in every chart and comparison here and elsewhere in the app.
      </Methodology>
    </div>
  );
}
