"use client";

import { useRef, type ReactNode } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { ChevronIcon } from "@/components/ui/icons";
import { Card } from "@/components/ui/Card";

export type ChartPeriod = "6M" | "1Y" | "2Y" | "5Y" | "All";

const PERIODS: readonly ChartPeriod[] = ["6M", "1Y", "2Y", "5Y", "All"];
const PERIOD_MONTHS: Record<Exclude<ChartPeriod, "All">, number> = { "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60 };

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** The date window a period shows, `offset` periods back from today. "All"
 * runs from the first reading to today and never pages. */
export function periodWindow(period: ChartPeriod, offset: number, earliest: string, today: string): { start: string; end: string } {
  if (period === "All") return { start: earliest < today ? earliest : today, end: today };
  const months = PERIOD_MONTHS[period];
  const end = addMonths(today, -months * offset);
  return { start: addDays(addMonths(end, -months), 1), end };
}

function monthYear(date: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
}

/** "Oct 2025 – Sept 2026", or "Apr – Sept 2026" within one year. */
export function periodLabel(span: { start: string; end: string }): string {
  const sameYear = span.start.slice(0, 4) === span.end.slice(0, 4);
  return `${monthYear(span.start, !sameYear)} – ${monthYear(span.end, true)}`;
}

/** A trend chart the way Apple Health presents one: a period picker, a
 * headline (the parent swaps it for the reading under the finger while
 * the chart is being dragged), the chart, and — for every period but All —
 * the visible span with arrows to step back and forward through time. On
 * a phone a quick sideways swipe on the chart does the same. */
export function TrendCard({
  period,
  onPeriod,
  offset,
  onOffset,
  earliest,
  today,
  headline,
  accent,
  children,
}: {
  period: ChartPeriod;
  onPeriod: (period: ChartPeriod) => void;
  offset: number;
  onOffset: (offset: number) => void;
  earliest: string;
  today: string;
  headline: ReactNode;
  accent?: string;
  children: ReactNode;
}) {
  const span = periodWindow(period, offset, earliest, today);
  const canGoBack = period !== "All" && span.start > earliest;
  const canGoForward = period !== "All" && offset > 0;
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);

  return (
    <Card tier="raw" className="flex flex-col gap-3 p-3.5">
      <Segmented
        value={period}
        onChange={(p) => {
          onPeriod(p);
          onOffset(0);
        }}
        accent={accent}
        fill
        options={PERIODS.map((p) => [p, p] as const)}
      />
      <div className="min-h-[4.5rem]">{headline}</div>
      <div
        style={{ touchAction: "pan-y" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          swipe.current = { x: t.clientX, y: t.clientY, t: Date.now() };
        }}
        onTouchEnd={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          // A quick sideways flick pages; a slow drag is the finger reading values.
          if (Math.abs(dx) < 60 || Math.abs(dy) > 40 || Date.now() - start.t > 350) return;
          if (dx > 0 && canGoBack) onOffset(offset + 1);
          if (dx < 0 && canGoForward) onOffset(offset - 1);
        }}
      >
        {children}
      </div>
      {period !== "All" && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOffset(offset + 1)}
            disabled={!canGoBack}
            aria-label="Earlier"
            className="tap-target flex h-8 w-8 items-center justify-center rounded-[10px] disabled:opacity-30"
            style={{ color: accent ?? "var(--ui-accent)" }}
          >
            <ChevronIcon dir="left" size={16} />
          </button>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {periodLabel(span)}
          </span>
          <button
            type="button"
            onClick={() => onOffset(offset - 1)}
            disabled={!canGoForward}
            aria-label="Later"
            className="tap-target flex h-8 w-8 items-center justify-center rounded-[10px] disabled:opacity-30"
            style={{ color: accent ?? "var(--ui-accent)" }}
          >
            <ChevronIcon dir="right" size={16} />
          </button>
        </div>
      )}
    </Card>
  );
}

/** The headline block shared by every trend card: a small caption (what
 * the number is, or the date being read), the number with its unit, and
 * one quiet line under it. */
export function TrendHeadline({
  caption,
  value,
  unit,
  color,
  detail,
}: {
  caption: string;
  value: string;
  unit?: string | null;
  color?: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        {caption}
      </span>
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl leading-tight font-semibold tabular-nums" style={{ color: color ?? "var(--text-primary)" }}>
          {value}
        </span>
        {unit && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {unit}
          </span>
        )}
      </p>
      {detail && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
