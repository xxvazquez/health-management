"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import {
  describeProgression,
  workoutConsistencySummary,
  workoutExerciseFrequency,
  workoutInsight,
  workoutMonthlySessions,
  workoutRecentSessions,
  workoutStatsByExercise,
  formatWorkoutDate,
  formatWorkoutDateShort,
  type WorkoutExerciseStats,
  type WorkoutRecentSession,
} from "@/lib/aggregations/workout";
import { formatMonthYear, todayLocalISODate } from "@/lib/aggregations/common";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import { getAllItems, withDataLock } from "@/lib/db/indexedDb";
import { workoutUnitLabel, type WorkoutExercise, type WorkoutUnit } from "@/lib/types";

// Same accent as every other Workout surface (Log's Workout tab, its
// timeline entries, Manage's Workout section) — color is otherwise
// reserved for MEANINGFUL STATE (improved/declined) on this page, not
// spent distinguishing seven exercises from each other. See DIRECTION_COLOR
// below for the only place color actually carries meaning on this page.
const ACCENT = TYPE_ACCENT.workout;

type Direction = "up" | "down" | "flat";

function changeDirection(changeKg: number): Direction {
  return changeKg > 0 ? "up" : changeKg < 0 ? "down" : "flat";
}

// "Down" is a normal outcome, not an error — deliberately not red/orange.
// Same up/down convention as Food's "Over time" trend list.
const DIRECTION_COLOR: Record<Direction, string> = {
  up: "var(--status-good)",
  down: "var(--status-warning)",
  flat: "var(--text-muted)",
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** Ranks by absolute kg change since first recorded — not percentage, which
 * would make a lighter lift's proportionally larger swing outrank a heavier
 * lift's bigger real gain. A single data point has nothing to rank (no
 * second reading to compare against yet), so it always sinks to the bottom
 * rather than reading as "0 kg change". */
function trendRank(s: WorkoutExerciseStats): number {
  return s.recordsCount >= 2 ? s.changeKg : -Infinity;
}

/** Compact label/value block for the Progression card's Started/Current/
 * Best/Change figures — deliberately small (not the app's big hero StatTile
 * treatment), since these are supporting detail for the chart above them,
 * not the page's main point. */
function ProgressionStat({ label, value, detail, accent }: { label: string; value: string; detail?: string; accent?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </p>
      {detail && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

/** "SQ", "BP", "OP" — a plain two-letter monogram, not an emoji or icon
 * asset, to keep the row marker calm and data-oriented rather than decorative. */
function monogram(exercise: WorkoutExercise): string {
  const words = exercise.split(" ");
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : exercise.slice(0, 2).toUpperCase();
}

/** Small filled-star accent badge for a set that beat every earlier one for
 * that exercise — the app's line-icon style (Nav.tsx) is stroke-only for
 * navigation chrome, but a tiny status accent like this reads better filled,
 * same idea as the app's other filled status dots. */
function PRBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: "color-mix(in oklab, var(--status-good) 16%, var(--surface-1))", color: "var(--status-good)" }}
    >
      <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 1.8l2.36 5.1 5.53.58-4.15 3.83 1.16 5.51L10 13.9l-4.9 2.92 1.16-5.51-4.15-3.83 5.53-.58z" />
      </svg>
      PR
    </span>
  );
}

/** First and most prominent section on the page — "what did I just do,
 * and when" — a compact vertical timeline of the last few training days
 * (see `workoutRecentSessions`), always full history so it never reads
 * empty just because a narrow range is selected elsewhere on the page. */
function RecentActivityTimeline({ sessions }: { sessions: WorkoutRecentSession[] }) {
  return (
    <Card tier="supporting" className="lg:col-span-2">
      <CardTitle subtitle="Your last few training days, most recent first — full history, not affected by the range filter below">
        Recent activity
      </CardTitle>
      <div className="flex flex-col">
        {sessions.map((session, i) => {
          const isLast = i === sessions.length - 1;
          return (
            <div key={session.date} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT }} />
                {!isLast && <span className="w-px flex-1" style={{ background: "var(--gridline)" }} />}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-3"}`}>
                <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  {formatWorkoutDateShort(session.date)}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {session.entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {e.exercise}
                      </span>
                      <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {e.weightKg} {workoutUnitLabel(e.unit)}
                      </span>
                      {e.isPR && <PRBadge />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** The page's main analytical section — ranked start→current→change per
 * exercise (answers "which lift has progressed the most" via row order and
 * a proportional bar) with the selected lift's own chart inline, in one
 * Card instead of two separate ones. Defaults to the top-ranked lift so
 * there's something useful to read before tapping anything; tapping another
 * row swaps the chart below without a second, redundant picker control. */
function ProgressSection({
  sortedStats,
  selectedStats,
  onSelect,
}: {
  sortedStats: WorkoutExerciseStats[];
  selectedStats: WorkoutExerciseStats | null;
  onSelect: (exercise: WorkoutExercise) => void;
}) {
  const trending = useMemo(() => sortedStats.filter((s) => s.recordsCount >= 2), [sortedStats]);
  const improving = useMemo(() => trending.filter((s) => s.changeKg > 0).length, [trending]);
  const maxAbsChangeKg = useMemo(
    () => Math.max(1, ...sortedStats.filter((s) => s.recordsCount >= 2).map((s) => Math.abs(s.changeKg))),
    [sortedStats],
  );

  const subtitle =
    trending.length > 0
      ? `${improving} of ${trending.length} lifts up since first recorded · ranked by kg change, full history — tap a lift for its chart.`
      : "Log an exercise a second time to start tracking a trend. Full history, not affected by the range filter below.";

  return (
    <Card tier="primary" className="lg:col-span-2">
      <CardTitle subtitle={subtitle}>Progress</CardTitle>
      <div className="flex flex-col">
        {sortedStats.map((s) => {
          const hasTrend = s.recordsCount >= 2;
          const active = s.exercise === selectedStats?.exercise;
          const direction = changeDirection(s.changeKg);
          const changeColor = DIRECTION_COLOR[direction];
          const barPct = hasTrend ? Math.max(4, Math.round((Math.abs(s.changeKg) / maxAbsChangeKg) * 100)) : 0;
          return (
            <button
              key={s.exercise}
              type="button"
              onClick={() => onSelect(s.exercise)}
              className="flex w-full items-center gap-4 border-t py-3.5 pr-3 pl-3 text-left transition-colors first:border-t-0"
              style={{ borderColor: "var(--gridline)", background: active ? "var(--page-plane)" : "transparent" }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                style={{ background: `color-mix(in oklab, ${ACCENT} 14%, var(--surface-1))`, color: ACCENT }}
              >
                {monogram(s.exercise)}
              </div>

              <div className="w-28 shrink-0 sm:w-36">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {s.exercise}
                </p>
                <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {s.started.weightKg} → {s.current.weightKg} {workoutUnitLabel(s.unit)}
                </p>
              </div>

              <div className="hidden flex-1 sm:block">
                <div className="h-1.5 w-full rounded-full" style={{ background: "var(--gridline)" }}>
                  {hasTrend && <div className="h-1.5 rounded-full" style={{ width: `${barPct}%`, background: changeColor }} />}
                </div>
              </div>

              <div className="ml-auto shrink-0 text-right">
                {hasTrend ? (
                  <p className="text-sm font-semibold tabular-nums" style={{ color: changeColor }}>
                    {s.changeKg >= 0 ? "↑" : "↓"} {signed(s.changeKg)} {workoutUnitLabel(s.unit)}
                    {s.changePct !== null && <span className="font-normal"> · {signed(s.changePct)}%</span>}
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    First entry
                  </p>
                )}
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Best {s.best.weightKg} {workoutUnitLabel(s.unit)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Start = first recorded weight · Current = most recent · Best = personal record
      </p>

      {selectedStats && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--gridline)" }}>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ProgressionStat
              label="Started"
              value={`${selectedStats.started.weightKg} ${workoutUnitLabel(selectedStats.unit)}`}
              detail={formatWorkoutDate(selectedStats.started.date)}
            />
            <ProgressionStat
              label="Current"
              value={`${selectedStats.current.weightKg} ${workoutUnitLabel(selectedStats.unit)}`}
              detail={formatWorkoutDate(selectedStats.current.date)}
            />
            <ProgressionStat
              label="Best"
              value={`${selectedStats.best.weightKg} ${workoutUnitLabel(selectedStats.unit)}`}
              detail={formatWorkoutDate(selectedStats.best.date)}
            />
            <ProgressionStat
              label="Change"
              value={`${signed(selectedStats.changeKg)} ${workoutUnitLabel(selectedStats.unit)}`}
              detail={selectedStats.changePct !== null ? `${signed(selectedStats.changePct)}%` : undefined}
              accent={DIRECTION_COLOR[changeDirection(selectedStats.changeKg)]}
            />
          </div>

          <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {describeProgression(selectedStats)}
          </p>

          <TrendAreaChart
            data={selectedStats.entries.map((e) => ({ date: e.date, value: e.weightKg }))}
            color={ACCENT}
            valueLabel={`${selectedStats.exercise} (${workoutUnitLabel(selectedStats.unit)})`}
            height={140}
            linear
            showDots
            xTickFormatter={formatMonthYear}
            yTickFormatter={(v) => `${v} ${workoutUnitLabel(selectedStats.unit)}`}
          />
        </div>
      )}
    </Card>
  );
}

export default function WorkoutPage() {
  const { status, workoutLogs } = useData();
  const today = useMemo(() => todayLocalISODate(), []);
  const [compareExercise, setCompareExercise] = useState<WorkoutExercise | null>(null);

  // DataContext doesn't expose raw items (only canonical events/logs), and
  // a workout log's own row has no unit of its own (see RawWorkoutLog's
  // doc comment) — its exercise's configured unit lives on the matching
  // workout_items row, so this page reads that directly, the same pattern
  // Manage/Log use for their own local snapshots. Without this, every
  // figure on this page silently assumed "kg" even for an exercise
  // configured as minutes or reps.
  const [unitByExercise, setUnitByExercise] = useState<Map<string, WorkoutUnit>>(new Map());
  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    void withDataLock(() => getAllItems()).then((items) => {
      if (cancelled) return;
      setUnitByExercise(new Map(items.filter((i) => i.itemType === "workout").map((i) => [i.rawName, i.unit ?? "kg"])));
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const { span, range, setRange, filtered: filteredWorkoutLogs } = useDateRangeFilter(workoutLogs);

  // Strength progress and Progression track a lift since its very first
  // recorded weight — filtering those to the range picker below would make
  // "Started" and "Best" wrong (they'd only reflect whatever's inside the
  // window), so they always read the full history. Only the frequency-style
  // cards (how often you trained, which lifts) are scoped to the range.
  const stats = useMemo(() => workoutStatsByExercise(workoutLogs, unitByExercise), [workoutLogs, unitByExercise]);
  // Same ranking the Progress section's rows use — read here too so the
  // default selection (before anything's been tapped) is the top-ranked
  // lift, not just whatever order it happened to come out of `stats`.
  const sortedStats = useMemo(() => [...stats].sort((a, b) => trendRank(b) - trendRank(a)), [stats]);
  const insight = useMemo(() => workoutInsight(workoutLogs, today, unitByExercise), [workoutLogs, today, unitByExercise]);
  const consistency = useMemo(() => workoutConsistencySummary(workoutLogs, today), [workoutLogs, today]);
  const monthlySessions = useMemo(() => workoutMonthlySessions(filteredWorkoutLogs), [filteredWorkoutLogs]);
  const exerciseFrequency = useMemo(() => workoutExerciseFrequency(filteredWorkoutLogs), [filteredWorkoutLogs]);
  const recentSessions = useMemo(() => workoutRecentSessions(workoutLogs, unitByExercise), [workoutLogs, unitByExercise]);

  const selectedExercise =
    compareExercise && stats.some((s) => s.exercise === compareExercise) ? compareExercise : (sortedStats[0]?.exercise ?? null);
  const selectedStats = stats.find((s) => s.exercise === selectedExercise) ?? null;

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  // Skip whatever the hero Insight already said outright, so the frequency
  // captions below add context rather than repeating the headline.
  const heroCoversFrequencyChange = insight?.headline.startsWith("Training frequency") ?? false;
  const heroCoversCurrentGap = insight?.headline.startsWith("It's been") ?? false;

  // A compact, single-line answer to "how often am I training" — folded
  // into the Training frequency card itself rather than a standalone
  // section, since a lone "longest gap" fact never earned its own heading.
  const frequencyCaptions: string[] = [];
  if (!consistency.insufficientData && consistency.recentAvgPerMonth !== null) {
    frequencyCaptions.push(
      !heroCoversFrequencyChange && consistency.priorAvgPerMonth !== null && consistency.recentAvgPerMonth !== consistency.priorAvgPerMonth
        ? `Averaging ${consistency.recentAvgPerMonth}/mo recently, vs ${consistency.priorAvgPerMonth}/mo the 3 months before`
        : `Averaging ${consistency.recentAvgPerMonth} sessions/month recently`,
    );
    if (consistency.longestGapDays !== null && consistency.longestGapDays >= 10) {
      frequencyCaptions.push(
        `Longest gap: ${consistency.longestGapDays} days (${formatWorkoutDate(consistency.longestGapStart!)}–${formatWorkoutDate(consistency.longestGapEnd!)})`,
      );
    }
    if (!heroCoversCurrentGap && consistency.currentGapDays !== null && consistency.currentGapDays >= 10) {
      frequencyCaptions.push(`${consistency.currentGapDays} days since the last logged session`);
    }
  }

  const rangeIsAllTime = !!span && !!range && range.start === span.start && range.end === span.end;
  const rangeLabel = range ? (rangeIsAllTime ? "all time" : `${formatWorkoutDate(range.start)} – ${formatWorkoutDate(range.end)}`) : "";

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Workout
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Charts and progression from what you&apos;ve logged — head to the{" "}
          <Link href="/log" className="underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            Log page
          </Link>{" "}
          to add a lift, or{" "}
          <Link href="/manage" className="underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            Manage
          </Link>{" "}
          to add, archive, or set units for exercises.
        </p>
      </div>

      {insight && (
        <div className="lg:col-span-2">
          <Insight label="What's happening" headline={insight.headline} detail={insight.detail} tone={insight.tone} />
        </div>
      )}

      {recentSessions.length > 0 && <RecentActivityTimeline sessions={recentSessions} />}

      {stats.length > 0 && <ProgressSection sortedStats={sortedStats} selectedStats={selectedStats} onSelect={setCompareExercise} />}

      <div className="lg:col-span-2">
        <p className="text-xs font-bold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Training patterns
        </p>
      </div>

      {span && range && (
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Showing <span style={{ color: "var(--text-secondary)" }}>{rangeLabel}</span> — affects the two charts below only
          </p>
          <DateRangeFilter span={span} value={range} onChange={setRange} accent={ACCENT} />
        </div>
      )}

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Any day at least one lift was logged, by month, in this range">Training frequency</CardTitle>
        {frequencyCaptions.length > 0 && (
          <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
            {frequencyCaptions.join(" · ")}
          </p>
        )}
        {monthlySessions.length > 1 ? (
          <TrendAreaChart
            data={monthlySessions.map((m) => ({ date: m.monthStart, value: m.sessions }))}
            color={ACCENT}
            valueLabel="Sessions"
            xTickFormatter={formatMonthYear}
            showEveryTick
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough data yet to show a monthly trend.</p>
        )}
      </Card>

      {exerciseFrequency.length > 0 && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Sessions each exercise appeared in — logging frequency, not training volume or load">
            Which lifts you train most
          </CardTitle>
          <RankedBarChart data={exerciseFrequency.map((e) => ({ label: e.exercise, value: e.sessionCount }))} color={ACCENT} />
        </Card>
      )}
    </div>
  );
}
