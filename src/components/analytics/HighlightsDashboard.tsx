"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useToday } from "@/lib/useToday";
import { useCheckIns } from "@/lib/useCheckIns";
import { usePreferences } from "@/lib/usePreferences";
import { useWorkoutUnits } from "@/lib/useWorkoutUnits";
import { useVisibleDomains, type TrackedDomain } from "@/lib/visibleDomains";
import { computeHighlights, type Highlight, type HighlightFormat } from "@/lib/aggregations/highlights";
import { formatMinutes } from "@/lib/aggregations/common";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import { EmptyState, InlineEmpty } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Methodology } from "@/components/ui/Methodology";
import { ChevronIcon } from "@/components/ui/icons";
import { BEFORE_COLOR, TrendBar } from "@/components/analytics/TrendList";

/** Cards shown before "Show all". */
const VISIBLE_COUNT = 4;

const DOMAIN_ACCENT: Partial<Record<TrackedDomain, string>> = {
  food: TYPE_ACCENT.food,
  supplement: TYPE_ACCENT.supplement,
  habit: TYPE_ACCENT.habit,
  outcome: TYPE_ACCENT.outcome,
  workout: TYPE_ACCENT.workout,
  stool: "var(--series-indigo)",
};

function formatValue(n: number, format: HighlightFormat): string {
  if (format === "minutes") return formatMinutes(n);
  if (format === "score") return n.toFixed(1);
  if (format === "percent") return `${n}%`;
  return n.toLocaleString();
}

function PeriodBar({ value, label, highlight, color, strong }: { value: number; label: string; highlight: Highlight; color: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums" style={{ color: strong ? "var(--text-primary)" : "var(--text-secondary)" }}>
          {formatValue(value, highlight.format)}
        </span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {highlight.unit}
        </span>
        <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      </div>
      <TrendBar pct={highlight.scaleMax > 0 ? (value / highlight.scaleMax) * 100 : 0} color={color} />
    </div>
  );
}

/** One Apple Health-style highlight: the section, what changed, and the
 * two periods as paired bars. Opens its Trends tab when there is one. */
function HighlightCard({ highlight }: { highlight: Highlight }) {
  const accent = (highlight.domain && DOMAIN_ACCENT[highlight.domain]) || "var(--series-berry)";
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: accent }}>
          {highlight.section}
        </span>
        {highlight.tab && (
          <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
            <ChevronIcon dir="right" size={14} />
          </span>
        )}
      </div>
      <p className="mt-0.5 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {highlight.title}
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        <PeriodBar value={highlight.now} label="Last 30 days" highlight={highlight} color={accent} strong />
        <PeriodBar value={highlight.before} label="30 days before" highlight={highlight} color={BEFORE_COLOR} />
      </div>
    </>
  );
  const cls = "block w-full rounded-xl border px-3.5 py-3 text-left";
  const style = { borderColor: "var(--border-hairline)", background: "var(--surface-1)" };
  return highlight.tab ? (
    // A real link, so Back returns here; the dashboard opens at its top.
    <a href={`#${highlight.tab}`} onClick={() => window.scrollTo(0, 0)} className={cls} style={style}>
      {body}
    </a>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

/** Trends' overview: what changed most in the last 30 days, across every
 * visible section. */
export function HighlightsDashboard() {
  const { status, events, workoutLogs, stoolLogs } = useData();
  const { checkIns: allCheckIns, loading: checkInsLoading, error: checkInsError, isDemo } = useCheckIns();
  // Mood and energy join in once check-ins have loaded.
  const checkIns = useMemo(() => (isDemo || (!checkInsLoading && !checkInsError) ? allCheckIns : []), [allCheckIns, checkInsLoading, checkInsError, isDemo]);
  const { prefs } = usePreferences();
  const { isVisible } = useVisibleDomains();
  const unitByExercise = useWorkoutUnits();
  const today = useToday();
  const [showAll, setShowAll] = useState(false);

  const highlights = useMemo(
    () =>
      computeHighlights({ events, workoutLogs, stoolLogs, checkIns, unitByExercise, schedules: prefs.itemSchedules ?? {}, today }).filter(
        (h) => !h.domain || isVisible(h.domain),
      ),
    [events, workoutLogs, stoolLogs, checkIns, unitByExercise, prefs.itemSchedules, today, isVisible],
  );

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const shown = showAll ? highlights : highlights.slice(0, VISIBLE_COUNT);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {highlights.length === 0 ? (
        <InlineEmpty title="Nothing stands out" description="Highlights appear when something changes compared with the month before." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((h) => (
            <HighlightCard key={h.id} highlight={h} />
          ))}
        </div>
      )}
      {highlights.length > VISIBLE_COUNT && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="hit-slop self-start px-3.5 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
          {showAll ? "Show fewer" : `Show all ${highlights.length}`}
        </button>
      )}

      <Methodology>
        Each highlight compares the last 30 days, up to yesterday, with the 30 days before. Averages (steps, sleep,
        mood, energy) use only the days with a value. Counts (training days, symptom days, different foods) only
        compare months when both were logged on a similar number of days. Supplements and habits are measured
        against their schedules. Small changes are left out, and the biggest come first.
      </Methodology>
    </div>
  );
}
