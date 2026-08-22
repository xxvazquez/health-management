"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
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

function StatTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value} <span className="text-xs font-normal">{unit}</span>
      </p>
    </div>
  );
}

export default function CyclePage() {
  const { status, periodLogs } = useData();
  const today = useMemo(() => todayLocalISODate(), []);

  // The delay banner always reads the FULL history — "is my period late
  // right now" can't depend on whatever range the charts below happen to
  // be showing. Everything else on the page (stats, both trend charts)
  // respects the range filter, per how every other analytics page works.
  const allRuns = useMemo(() => groupIntoPeriodRuns(periodLogs), [periodLogs]);
  const currentStatus = useMemo(() => currentCycleStatus(allRuns, today), [allRuns, today]);
  const nextPredictions = useMemo(() => predictUpcomingPeriods(allRuns, 1), [allRuns]);
  const delayDays = useMemo(() => periodDelayDays(nextPredictions, today, currentStatus.onPeriod), [nextPredictions, today, currentStatus.onPeriod]);
  // Only counts down while the expected date is still ahead — once it's
  // passed, that's the delayDays/Insight banner's job instead, so the two
  // never say conflicting things at once.
  const daysUntilNext = !currentStatus.onPeriod && nextPredictions[0] && today < nextPredictions[0].expectedStart ? daysBetween(today, nextPredictions[0].expectedStart) : null;

  const { span, range, setRange, filtered } = useDateRangeFilter(periodLogs);
  const filteredRuns = useMemo(() => groupIntoPeriodRuns(filtered), [filtered]);
  const analysis = useMemo(() => cycleAnalysis(filteredRuns), [filteredRuns]);
  const cycleTrend = useMemo(() => cycleLengthTrend(filteredRuns), [filteredRuns]);
  const periodTrend = useMemo(() => periodLengthTrend(filteredRuns), [filteredRuns]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const rangeIsAllTime = !!span && !!range && range.start === span.start && range.end === span.end;
  const rangeLabel = range ? (rangeIsAllTime ? "all time" : `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`) : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Cycle
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Patterns from what you&apos;ve logged — head to the{" "}
          <Link href="/log" className="underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            Log page
          </Link>{" "}
          to record or correct a period day.
        </p>
      </div>

      {(currentStatus.onPeriod || currentStatus.cycleDay !== null) && (
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {currentStatus.onPeriod ? `Day ${currentStatus.periodDay} of your period` : `Day ${currentStatus.cycleDay} of your cycle`}
          {daysUntilNext !== null && ` · ${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"} left until your period`}
        </p>
      )}

      {delayDays !== null && (
        <Insight
          label="What's happening"
          headline={`Your period is ${delayDays} day${delayDays === 1 ? "" : "s"} late`}
          detail={`Expected around ${formatShortDate(nextPredictions[0].expectedStart)}, based on your recent cycle length. Cycles vary — this isn't a diagnosis.`}
          tone="attention"
        />
      )}

      {periodLogs.length === 0 ? (
        <EmptyState title="No cycle data yet" description="Log a period day on the Log page's Cycle tab to see patterns here." />
      ) : (
        <>
          {span && range && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Showing <span style={{ color: "var(--text-secondary)" }}>{rangeLabel}</span> — affects everything below
              </p>
              <DateRangeFilter span={span} value={range} onChange={setRange} accent={ACCENT} />
            </div>
          )}

          <Card tier="raw">
            <CardTitle size="sm" subtitle={`Based on your last ${analysis.cyclesAnalyzed || 0} recorded cycle${analysis.cyclesAnalyzed === 1 ? "" : "s"} in this range — an estimate, not a guarantee`}>
              Cycle statistics
            </CardTitle>
            {analysis.cyclesAnalyzed === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Record at least two periods in this range to see cycle statistics.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Last cycle" value={String(analysis.lastCycleLength)} unit="days" />
                <StatTile label="Average cycle" value={String(analysis.averageCycleLength)} unit="days" />
                <StatTile label="Cycle variation" value={`± ${analysis.cycleLengthVariation ?? 0}`} unit="days" />
                <StatTile label="Average period" value={String(analysis.averagePeriodLength)} unit="days" />
              </div>
            )}
          </Card>

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
