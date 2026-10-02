"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ChevronIcon } from "@/components/ui/icons";
import { TrendsActions } from "@/components/analytics/TrendsActions";
import { ShowAllRow, SplitStatCard, TrendCaption, TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import { DEFAULT_PRESETS, DateRangeFilter, describeDateRange } from "@/components/ui/DateRangeFilter";
import { LabMarkerChart, type LabMarkerChartPoint } from "@/components/charts/LabMarkerChart";
import { TrendHeadline } from "@/components/charts/TrendCard";
import { DEFAULT_RANGE_DAYS, useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate, daysBetween, formatMinutes, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import {
  workoutExerciseSummaries,
  workoutRecentEntries,
  workoutWeeklySessions,
  type WorkoutExerciseSummary,
} from "@/lib/aggregations/workout";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import { getAllItems, withDataLock } from "@/lib/db/indexedDb";
import { workoutUnitLabel, workoutValueLabel, type WorkoutUnit } from "@/lib/types";

const ACCENT = TYPE_ACCENT.workout;
const RECENT_SHOWN = 3;

/** "Last 30 days", "All time" or "3 Sept – 1 Oct" — the caption suffix. */
function rangeText(span: DateRange, range: DateRange): string {
  const label = describeDateRange(DEFAULT_PRESETS, span, range);
  return /^\d/.test(label) ? `Last ${label}` : label;
}

function shortDate(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDaysToDate(today, -1)) return "Yesterday";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
}

function amount(value: number, unit: WorkoutUnit): string {
  return `${value} ${workoutUnitLabel(unit)}`;
}

/** "Heaviest set per session", "Time per session", "Reps per session". */
function perSessionCaption(s: WorkoutExerciseSummary): string {
  const kind = workoutValueLabel(s.unit);
  if (kind === "Weight") return "Heaviest set per session";
  if (kind === "Duration") return "Time per session";
  if (kind === "Reps") return "Reps per session";
  return "Per session";
}

function HealthCard({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <TrendCaption>{caption}</TrendCaption>
      <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {children}
      </div>
    </section>
  );
}

/** Training days per week as bars, empty weeks as a grey tick on the baseline, the scale on the right. */
function WeeklyBars({ weeks, today }: { weeks: { weekStart: string; sessions: number }[]; today: string }) {
  const max = Math.max(1, ...weeks.map((w) => w.sessions));
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <div className="relative flex h-24 min-w-0 flex-1 items-end gap-1 border-b" style={{ borderColor: "var(--gridline)" }}>
          <span className="absolute inset-x-0 top-0 border-t border-dashed" style={{ borderColor: "var(--gridline)" }} aria-hidden="true" />
          {weeks.map((w) => (
            <span key={w.weekStart} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${w.sessions} in the week of ${shortDate(w.weekStart, today)}`}>
              <span
                className="block w-full max-w-8 rounded-t-[3px]"
                style={w.sessions > 0 ? { height: `${(w.sessions / max) * 100}%`, background: ACCENT } : { height: 3, background: "var(--gridline)" }}
              />
            </span>
          ))}
        </div>
        <div className="flex h-24 w-4 flex-col justify-between text-xs tabular-nums" style={{ color: "var(--text-muted)" }} aria-hidden="true">
          <span className="-mt-2">{max}</span>
          <span className="-mb-2">0</span>
        </div>
      </div>
      <div className="mt-1 flex justify-between pr-6 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        <span>{shortDate(weeks[0].weekStart, today)}</span>
        {weeks.length > 1 && <span>{shortDate(weeks[weeks.length - 1].weekStart, today)}</span>}
      </div>
    </div>
  );
}

function ExerciseDetail({ summary, when, range, today }: { summary: WorkoutExerciseSummary; when: string; range: DateRange; today: string }) {
  const [scrub, setScrub] = useState<LabMarkerChartPoint | null>(null);
  const { sessions, unit, timed, best, last } = summary;
  const first = sessions[0];
  const change = Math.round((last.value - first.value) * 10) / 10;
  const shown = scrub ?? { date: last.date, value: last.value };
  const lastDay = new Date(`${last.date}T00:00:00`);

  const detail = scrub
    ? null
    : !timed && sessions.length >= 2 && change !== 0
      ? (
          <span style={{ color: change > 0 ? "var(--status-good)" : "var(--status-serious)" }}>
            {change > 0 ? "+" : "−"}
            {amount(Math.abs(change), unit)} since {shortDate(first.date, today)}
          </span>
        )
      : shortDate(last.date, today);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="-ml-1 flex min-h-11 items-center gap-0.5 text-sm font-medium"
          style={{ color: "var(--ui-accent)" }}
        >
          <ChevronIcon dir="left" size={16} />
          Workout
        </button>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {summary.exercise}
        </h2>
      </div>
      <HealthCard caption={`${perSessionCaption(summary)} · ${when}`}>
        <TrendHeadline caption={scrub ? shortDate(scrub.date, today) : "Latest"} value={String(shown.value)} unit={workoutUnitLabel(unit)} detail={detail} />
        <div className="mt-3">
          <LabMarkerChart
            data={sessions}
            unit={workoutUnitLabel(unit)}
            refLow={null}
            refHigh={null}
            windowStart={range.start}
            windowEnd={range.end}
            color={ACCENT}
            onScrub={setScrub}
            height={180}
          />
        </div>
      </HealthCard>
      <SplitStatCard
        items={
          timed
            ? [
                { caption: "Longest", value: String(best.value), unit: workoutUnitLabel(unit), detail: shortDate(best.date, today) },
                { caption: "Average", value: String(Math.round(summary.average)), unit: workoutUnitLabel(unit) },
                { caption: "Sessions", value: String(sessions.length), detail: "in range" },
              ]
            : [
                { caption: "Best", value: String(best.value), unit: workoutUnitLabel(unit), detail: shortDate(best.date, today) },
                { caption: "Sessions", value: String(sessions.length), detail: "in range" },
                {
                  caption: "Last",
                  value: String(lastDay.getDate()),
                  unit: lastDay.toLocaleDateString(undefined, { month: "short" }),
                  detail: amount(last.value, unit),
                },
              ]
        }
      />
    </div>
  );
}

export function WorkoutDashboard() {
  const { status, events, workoutLogs } = useData();
  const today = useMemo(() => todayLocalISODate(), []);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);

  // A workout log has no unit of its own; its exercise's unit lives on the
  // matching workout_items row, re-read after every shared refresh.
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
  }, [status, events]);

  // An exercise opens as its own screen with a history entry, so Back and
  // the edge swipe return to the overview.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOpenExercise(e.state?.workoutExercise ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function openDetail(exercise: string) {
    window.history.pushState({ ...window.history.state, workoutExercise: exercise }, "");
    setOpenExercise(exercise);
    window.scrollTo(0, 0);
  }

  const { span, range, setRange } = useDateRangeFilter(workoutLogs, DEFAULT_RANGE_DAYS);
  const weeks = useMemo(() => (range ? workoutWeeklySessions(workoutLogs, range) : []), [workoutLogs, range]);
  const exercises = useMemo(() => (range ? workoutExerciseSummaries(workoutLogs, range, unitByExercise) : []), [workoutLogs, range, unitByExercise]);
  const recent = useMemo(() => workoutRecentEntries(workoutLogs, unitByExercise), [workoutLogs, unitByExercise]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;
  if (!span || !range) return null;

  const when = rangeText(span, range);
  const filter = (
    <TrendsActions>
      <DateRangeFilter span={span} value={range} onChange={setRange} accent={ACCENT} />
    </TrendsActions>
  );

  const opened = openExercise ? exercises.find((e) => e.exercise === openExercise) : null;
  if (opened) {
    return (
      <>
        {filter}
        <ExerciseDetail key={opened.exercise} summary={opened} when={when} range={range} today={today} />
      </>
    );
  }

  const sessionCount = weeks.reduce((n, w) => n + w.sessions, 0);
  const lastTrained = recent[0]?.date ?? null;
  const sinceLast = lastTrained ? daysBetween(lastTrained, today) : null;
  const shownRecent = showAllRecent ? recent : recent.slice(0, RECENT_SHOWN);

  return (
    <div className="flex flex-col gap-4">
      {filter}

      <HealthCard caption={`Sessions · ${when}`}>
        <p className="flex items-baseline gap-1.5">
          <span className="text-2xl leading-tight font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {sessionCount}
          </span>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {sessionCount === 1 ? "day" : "days"}
          </span>
        </p>
        {lastTrained && sinceLast !== null && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Last on {shortDate(lastTrained, today)}
            {sinceLast > 1 ? ` · ${sinceLast} days ago` : ""}
          </p>
        )}
        {weeks.length > 0 && <WeeklyBars weeks={weeks} today={today} />}
      </HealthCard>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {recent.length > 0 && (
          <TrendGroup caption="Recent">
            {shownRecent.map((r) => (
              <TrendRow key={`${r.exercise}-${r.date}`} label={r.exercise} sublabel={shortDate(r.date, today)} value={amount(r.value, r.unit)} />
            ))}
            {recent.length > RECENT_SHOWN && <ShowAllRow total={recent.length} expanded={showAllRecent} onToggle={() => setShowAllRecent((v) => !v)} />}
          </TrendGroup>
        )}

        {exercises.length > 0 && (
          <TrendGroup caption={`By exercise · ${when}`}>
            {exercises.map((e) => (
              <TrendRow
                key={e.exercise}
                label={e.exercise}
                sublabel={`${e.sessions.length} ${e.sessions.length === 1 ? "session" : "sessions"}`}
                value={e.timed ? `${["minutes", "min"].includes(e.unit) && e.total >= 60 ? formatMinutes(e.total) : amount(e.total, e.unit)} total` : `best ${amount(e.best.value, e.unit)}`}
                onClick={() => openDetail(e.exercise)}
              />
            ))}
          </TrendGroup>
        )}
      </div>
    </div>
  );
}
