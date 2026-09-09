"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
import { StatChip } from "@/components/ui/StatChip";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { groupIntoPeriodRuns, currentCycleStatus, predictUpcomingPeriods, periodDelayDays, cycleAnalysis, cycleLengthTrend, periodLengthTrend } from "@/lib/aggregations/cycle";
import { daysBetween, formatMonthYear, todayLocalISODate } from "@/lib/aggregations/common";

// Same rose accent as the Log page's Cycle tab.
const ACCENT = "var(--series-4)";

function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CycleDashboard() {
  const { status, periodLogs } = useData();
  const today = useMemo(() => todayLocalISODate(), []);

  // The delay banner always reads the FULL history — "is my period late
  // right now" can't depend on whatever range the charts below happen to
  // be showing. Everything else on the page (stats, both trend charts)
  // respects the range filter, per how every other analytics page works.
  const allRuns = useMemo(() => groupIntoPeriodRuns(periodLogs), [periodLogs]);
  const currentStatus = useMemo(() => currentCycleStatus(allRuns, today), [allRuns, today]);
  const nextPredictions = useMemo(() => predictUpcomingPeriods(allRuns, 1, today), [allRuns, today]);
  const delayDays = useMemo(() => periodDelayDays(nextPredictions, today, currentStatus.onPeriod), [nextPredictions, today, currentStatus.onPeriod]);
  // Only counts down while the expected date is still ahead — once it's
  // passed, that's the delayDays/Insight banner's job instead, so the two
  // never say conflicting things at once.
  const daysUntilNext = !currentStatus.onPeriod && nextPredictions[0] && today < nextPredictions[0].expectedStart ? daysBetween(today, nextPredictions[0].expectedStart) : null;

  const { span, range, setRange, filtered } = useDateRangeFilter(periodLogs);
  const filteredRuns = useMemo(() => groupIntoPeriodRuns(filtered), [filtered]);
  const analysis = useMemo(() => cycleAnalysis(filteredRuns, today), [filteredRuns, today]);
  const cycleTrend = useMemo(() => cycleLengthTrend(filteredRuns), [filteredRuns]);
  const periodTrend = useMemo(() => periodLengthTrend(filteredRuns), [filteredRuns]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const rangeIsAllTime = !!span && !!range && range.start === span.start && range.end === span.end;
  const rangeLabel = range ? (rangeIsAllTime ? "all time" : `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`) : "";

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        subtitle={
          <>
            Patterns from what you&apos;ve logged — head to the{" "}
            <Link href="/log" className="underline" style={{ color: "var(--series-1)" }}>
              Log page
            </Link>{" "}
            to record or correct a period day.
          </>
        }
      >
        Cycle
      </DashboardHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {(currentStatus.onPeriod || currentStatus.cycleDay !== null) && (
          <span
            className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2.5 py-1 text-sm font-semibold"
            style={{ background: `color-mix(in oklab, ${ACCENT} 13%, var(--surface-1))`, color: ACCENT }}
          >
            {currentStatus.onPeriod ? `Day ${currentStatus.periodDay} of your period` : `Day ${currentStatus.cycleDay} of your cycle`}
            {daysUntilNext !== null && (
              <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
                {daysUntilNext} day{daysUntilNext === 1 ? "" : "s"} until your period
              </span>
            )}
          </span>
        )}
        {span && range && (
          <div className="ml-auto">
            <DateRangeFilter span={span} value={range} onChange={setRange} accent={ACCENT} />
          </div>
        )}
      </div>

      {delayDays !== null && (
        <Insight
          label="What stands out"
          headline={`Your period is ${delayDays} day${delayDays === 1 ? "" : "s"} late`}
          detail={`Expected around ${formatShortDate(nextPredictions[0].expectedStart)}, based on your recent cycle length. Cycles vary — this isn't a diagnosis.`}
          tone="attention"
        />
      )}

      {periodLogs.length === 0 ? (
        <EmptyState title="No cycle data yet" description="Log a period day on the Log page's Cycle tab to see patterns here." />
      ) : (
        <>
          {analysis.cyclesAnalyzed === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Record at least two periods in {rangeLabel === "all time" ? "your history" : "this range"} to see cycle statistics.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <StatChip label="Last cycle" value={String(analysis.lastCycleLength)} detail="days" accent={ACCENT} />
              <StatChip label="Average cycle" value={String(analysis.averageCycleLength)} detail="days" />
              <StatChip label="Cycle variation" value={`± ${analysis.cycleLengthVariation ?? 0}`} detail="days" />
              <StatChip label="Average period" value={String(analysis.averagePeriodLength)} detail="days" />
            </div>
          )}

          <Card tier="raw">
            <CardTitle size="sm" subtitle="Days between one period's start and the next, over time">
              Cycle length
            </CardTitle>
            {cycleTrend.length > 1 ? (
              <TrendAreaChart data={cycleTrend} color={ACCENT} valueLabel="Cycle length (days)" xTickFormatter={formatMonthYear} yTickFormatter={(v) => `${v}d`} showDots />
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough completed cycles in this range yet.</p>
            )}
          </Card>

          <Card tier="raw">
            <CardTitle size="sm" subtitle="How many days each recorded period lasted, over time">
              Period duration
            </CardTitle>
            {periodTrend.length > 1 ? (
              <TrendAreaChart data={periodTrend} color={ACCENT} valueLabel="Period length (days)" xTickFormatter={formatMonthYear} yTickFormatter={(v) => `${v}d`} showDots />
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough recorded periods in this range yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
