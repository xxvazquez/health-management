"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ShowAllRow, SplitStatCard, TrendCaption, TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import { useCheckIns } from "@/lib/useCheckIns";
import {
  checkInsByPhase,
  cycleAnalysis,
  cycleChartEntries,
  cycleHistory,
  currentCycleStatus,
  groupIntoPeriodRuns,
  periodDelayDays,
  predictUpcomingPeriods,
  type CycleHistoryEntry,
} from "@/lib/aggregations/cycle";
import { daysBetween, todayLocalISODate } from "@/lib/aggregations/common";

// Same rose accent as the Log page's Cycle tab.
const ACCENT = "var(--series-4)";
const PALE = "color-mix(in oklab, var(--series-4) 28%, var(--surface-1))";
const HISTORY_SHOWN = 6;
const MIN_CYCLES_FOR_VARIATION = 3;

function shortDate(date: string, today: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });
}

function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

function Panel({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <TrendCaption>{caption}</TrendCaption>
      <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {children}
      </div>
    </section>
  );
}

/** A thin bar: the whole cycle pale, its period part in full colour. */
function CycleBar({ cycle, longest }: { cycle: CycleHistoryEntry; longest: number }) {
  return (
    <span className="block h-[5px] w-full overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden="true">
      <span className="flex h-full rounded-full" style={{ width: `${Math.min(100, (cycle.length / longest) * 100)}%`, background: PALE }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (cycle.periodDays / cycle.length) * 100)}%`, background: ACCENT }} />
      </span>
    </span>
  );
}

/** One bar per completed cycle (period part full, the rest pale), the average as a dashed line, scale on the right. */
function LengthChart({ cycles, average, today }: { cycles: CycleHistoryEntry[]; average: number | null; today: string }) {
  const max = Math.ceil(Math.max(...cycles.map((c) => c.length), average ?? 0) / 5) * 5;
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex h-32 min-w-0 flex-1 items-end gap-1.5 border-b" style={{ borderColor: "var(--gridline)" }}>
          {average !== null && (
            <span
              className="absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${(average / max) * 100}%`, borderColor: "var(--text-muted)" }}
              aria-hidden="true"
            />
          )}
          {cycles.map((c) => (
            <span key={c.start} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${shortDate(c.start, today)}: ${days(c.length)}, period ${days(c.periodDays)}`}>
              <span className="flex w-full max-w-6 flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: `${(c.length / max) * 100}%`, background: PALE }}>
                <span className="block w-full" style={{ height: `${(c.periodDays / c.length) * 100}%`, background: ACCENT }} />
              </span>
            </span>
          ))}
        </div>
        <div className="flex h-32 w-5 flex-col justify-between text-xs tabular-nums" style={{ color: "var(--text-muted)" }} aria-hidden="true">
          <span className="-mt-2">{max}</span>
          <span className="-mb-2">0</span>
        </div>
      </div>
      <div className="mt-1 flex justify-between pr-7 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        <span>{shortDate(cycles[0].start, today)}</span>
        {cycles.length > 1 && <span>{shortDate(cycles[cycles.length - 1].start, today)}</span>}
      </div>
      {average !== null && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Dashed line: average {days(Math.round(average))}
        </p>
      )}
    </div>
  );
}

export function CycleDashboard() {
  const { status, periodLogs } = useData();
  const today = useMemo(() => todayLocalISODate(), []);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Cycles need the whole history — a month holds less than one — so this
  // page has no range filter.
  const runs = useMemo(() => groupIntoPeriodRuns(periodLogs), [periodLogs]);
  const current = useMemo(() => currentCycleStatus(runs, today), [runs, today]);
  const next = useMemo(() => predictUpcomingPeriods(runs, 1, today)[0] ?? null, [runs, today]);
  const lateDays = useMemo(() => periodDelayDays(next ? [next] : [], today, current.onPeriod), [next, today, current.onPeriod]);
  const analysis = useMemo(() => cycleAnalysis(runs, today), [runs, today]);
  const history = useMemo(() => cycleHistory(runs, today), [runs, today]);
  const chart = useMemo(() => cycleChartEntries(history), [history]);
  const { checkIns, loading: checkInsLoading, error: checkInsError } = useCheckIns();
  const byPhase = useMemo(() => (checkInsLoading || checkInsError ? [] : checkInsByPhase(runs, checkIns)), [runs, checkIns, checkInsLoading, checkInsError]);
  const showByPhase = byPhase.some((p) => p.mood != null || p.energy != null);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;
  if (periodLogs.length === 0) return <EmptyState title="No cycle data yet" description="Log a period day on the Log page's Cycle tab to see patterns here." />;

  const lastStart = runs[runs.length - 1].startDate;
  const typical = next ? daysBetween(lastStart, next.expectedStart) : null;
  const longest = Math.max(1, ...history.filter((c) => !c.gap).map((c) => c.length));
  const shownHistory = showAllHistory ? history : history.slice(0, HISTORY_SHOWN);
  const enoughForVariation = analysis.cyclesAnalyzed >= MIN_CYCLES_FOR_VARIATION;

  return (
    <div className="flex flex-col gap-4">
      {current.cycleDay !== null && (
        <Panel caption="Current cycle">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-2xl leading-tight font-semibold tabular-nums" style={{ color: ACCENT }}>
              {current.onPeriod ? `Day ${current.periodDay} of your period` : `Day ${current.cycleDay}`}
            </span>
            {typical !== null && (
              <span className="shrink-0 text-sm" style={{ color: "var(--text-secondary)" }}>
                of about {typical}
              </span>
            )}
          </p>
          {typical !== null && (
            <span className="mt-2.5 block h-[5px] w-full overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (current.cycleDay / typical) * 100)}%`, background: ACCENT }} />
            </span>
          )}
          {lateDays !== null ? (
            <p className="mt-2 text-sm" style={{ color: "var(--status-serious)" }}>
              Period is {days(lateDays)} late
            </p>
          ) : (
            next &&
            !current.onPeriod && (
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                Next period in about {days(daysBetween(today, next.expectedStart))} · {shortDate(next.expectedStart, today)}
              </p>
            )
          )}
        </Panel>
      )}

      {analysis.cyclesAnalyzed > 0 && (
        <SplitStatCard
          items={[
            { caption: "Cycle", value: String(Math.round(analysis.averageCycleLength!)), unit: "days", detail: "average" },
            analysis.averagePeriodLength !== null
              ? { caption: "Period", value: String(Math.round(analysis.averagePeriodLength)), unit: "days", detail: "average" }
              : { caption: "Period", value: "—" },
            enoughForVariation
              ? { caption: "Variation", value: `± ${Math.round(analysis.cycleLengthVariation ?? 0)}`, unit: "days", detail: "cycle to cycle" }
              : { caption: "Variation", value: "—", detail: `after ${MIN_CYCLES_FOR_VARIATION} cycles` },
          ]}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TrendGroup caption="Cycle history">
          {shownHistory.map((c) => (
            <div key={c.start} className="min-h-11 px-3.5 py-2.5">
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
                    {shortDate(c.start, today)} – {c.current ? "now" : shortDate(c.end, today)}
                    {c.gap && (
                      <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        gap?
                      </span>
                    )}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                    Period {days(c.periodDays)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums" style={{ color: c.current ? ACCENT : "var(--text-secondary)" }}>
                  {c.current ? `Day ${c.length}` : days(c.length)}
                </span>
              </span>
              <span className="mt-1.5 block">
                <CycleBar cycle={c} longest={longest} />
              </span>
            </div>
          ))}
          {history.length > HISTORY_SHOWN && <ShowAllRow total={history.length} expanded={showAllHistory} onToggle={() => setShowAllHistory((v) => !v)} />}
        </TrendGroup>

        <div className="flex flex-col gap-4">
          {chart.length >= MIN_CYCLES_FOR_VARIATION && (
            <Panel caption="Cycle and period length">
              <LengthChart cycles={chart} average={analysis.averageCycleLength} today={today} />
            </Panel>
          )}

          {showByPhase && (
            <TrendGroup caption="Mood and energy by phase" note="Average check-in, 1 low to 5 high, over completed cycles.">
              {byPhase.map((p) => (
                <TrendRow
                  key={p.phase}
                  label={p.phase}
                  sublabel={`${p.days} day${p.days === 1 ? "" : "s"}`}
                  value={`Mood ${p.mood?.toFixed(1) ?? "—"} · Energy ${p.energy?.toFixed(1) ?? "—"}`}
                />
              ))}
            </TrendGroup>
          )}
        </div>
      </div>
    </div>
  );
}
