"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { ChevronIcon } from "@/components/ui/icons";
import { addDaysToDate, isoWeekStart, monthStart } from "@/lib/aggregations/common";
import { buildPeriodReview } from "@/lib/aggregations/periodReview";
import type { CanonicalEvent, RawWorkoutLog, RawPeriodLog } from "@/lib/types";
import type { DateRange } from "@/lib/aggregations/common";

type Period = "week" | "month";

function rangeFor(period: Period, anchor: string): DateRange {
  if (period === "week") {
    const start = isoWeekStart(anchor);
    return { start, end: addDaysToDate(start, 6) };
  }
  const start = monthStart(anchor);
  const nextMonth = new Date(`${start}T00:00:00`);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const end = addDaysToDate(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`, -1);
  return { start, end };
}

function shiftAnchor(period: Period, anchor: string, delta: number): string {
  return period === "week" ? addDaysToDate(anchor, delta * 7) : addDaysToDate(anchor, delta * 30);
}

function formatRangeLabel(range: DateRange): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

function TotalTile({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

/**
 * Overview's Weekly/Monthly Review — plain totals plus a couple of
 * descriptive highlights for whichever week or month is selected, reusing
 * `buildPeriodReview`. Never a causal or medical claim, matching the
 * request this section was built against — a count or a "most X" fact,
 * nothing framed as advice.
 */
export function PeriodReviewSection({
  events,
  workoutLogs,
  periodLogs,
  today,
  notesInRange,
}: {
  events: CanonicalEvent[];
  workoutLogs: RawWorkoutLog[];
  periodLogs: RawPeriodLog[];
  today: string;
  /** Given a range, how many notes (sent or received) fall inside it —
   * injected by the page since Notes lives in Supabase directly, same
   * boundary buildPeriodReview itself keeps. */
  notesInRange: (range: DateRange) => number;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(today);

  const range = useMemo(() => rangeFor(period, anchor), [period, anchor]);
  const review = useMemo(
    () => buildPeriodReview(events, workoutLogs, periodLogs, range, notesInRange(range)),
    [events, workoutLogs, periodLogs, range, notesInRange],
  );
  const isCurrent = today >= range.start && today <= range.end;

  return (
    <Card tier="raw">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CardTitle size="sm" subtitle={formatRangeLabel(range)}>
          {period === "week" ? "This week" : "This month"} review
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--border-hairline)" }}>
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPeriod(p);
                  setAnchor(today);
                }}
                className="px-2.5 py-1 text-xs font-medium capitalize"
                style={{
                  background: period === p ? "var(--page-plane)" : "transparent",
                  color: period === p ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
            aria-label="Previous period"
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronIcon dir="left" size={14} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}
            disabled={isCurrent}
            aria-label="Next period"
            className="flex h-6 w-6 items-center justify-center rounded-md disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronIcon dir="right" size={14} />
          </button>
        </div>
      </div>

      {!review.hasData ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing logged {isCurrent ? "yet" : "in this period"}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <TotalTile label="Unique foods" value={review.totals.uniqueFoods} />
            <TotalTile label="Notes exchanged" value={review.totals.notesExchanged} />
          </div>
          {review.highlights.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm" style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}>
              {review.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
