"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { addDaysToDate, monthStart } from "@/lib/aggregations/common";
import { groupIntoPeriodRuns, currentCycleStatus, predictUpcomingPeriods } from "@/lib/aggregations/cycle";
import { PERIOD_INTENSITIES, COLLECTION_METHODS, type RawPeriodLog, type PeriodIntensity, type CollectionMethod } from "@/lib/types";

/** Same thin-stroke icon language as Stool's own chip icons — small enough
 * (14px) to sit inline in front of a chip label. */
function ChipIconWrap({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Same droplet glyph as Stool's "mucus" chip icon — reused rather than
 * invented, since it already reads as a fluid indicator in this app. Its
 * rendered size grows with intensity, so the four levels stay visually
 * distinct without needing four different shapes. */
const INTENSITY_ICON_SIZE: Record<PeriodIntensity, number> = { Light: 10, Medium: 13, Heavy: 16, "Super Heavy": 19 };
function IntensityIcon({ level }: { level: PeriodIntensity }) {
  return (
    <svg width={INTENSITY_ICON_SIZE[level]} height={INTENSITY_ICON_SIZE[level]} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 3c2.6 3.8 4.5 6.6 4.5 9a4.5 4.5 0 0 1-9 0c0-2.4 1.9-5.2 4.5-9Z" />
    </svg>
  );
}

function TamponIcon() {
  return (
    <ChipIconWrap>
      <rect x="7.5" y="3" width="5" height="11" rx="2.5" />
      <path d="M10 14v3.5" />
    </ChipIconWrap>
  );
}
function PadIcon() {
  return (
    <ChipIconWrap>
      <rect x="4" y="7" width="12" height="6" rx="3" />
      <path d="M4 8.5c-1.4.3-1.4 3.7 0 4M16 8.5c1.4.3 1.4 3.7 0 4" />
    </ChipIconWrap>
  );
}
function PantyLinerIcon() {
  return (
    <ChipIconWrap>
      <rect x="5.5" y="8" width="9" height="4" rx="2" />
    </ChipIconWrap>
  );
}
function PeriodUnderwearIcon() {
  return (
    <ChipIconWrap>
      <path d="M4 4h12l-1.2 6.5c-.3 1.7-1.6 3-3.3 3.2L10 14l-1.5-.3c-1.7-.3-3-1.5-3.3-3.2Z" />
    </ChipIconWrap>
  );
}
const COLLECTION_METHOD_ICON: Record<string, ReactNode> = {
  Tampon: <TamponIcon />,
  Pad: <PadIcon />,
  "Panty Liner": <PantyLinerIcon />,
  "Period Underwear": <PeriodUnderwearIcon />,
};

function Chip({ label, active, onClick, accent, icon }: { label: string; active: boolean; onClick: () => void; accent: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-normal whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? accent : "var(--border-hairline)",
        background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
        color: active ? accent : "var(--text-secondary)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function formatFullDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatMonthLabel(monthDate: string): string {
  return new Date(`${monthDate}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Monday-first, always 7-column weeks — includes the trailing days of the
 * previous/next month needed to complete the first/last week, same as any
 * standard month-grid calendar. */
function calendarGridDates(monthDate: string): string[] {
  const first = new Date(`${monthDate}T00:00:00`);
  const startOffset = (first.getDay() + 6) % 7; // days since Monday
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function shiftMonth(monthDate: string, delta: number): string {
  const d = new Date(`${monthDate}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** One compact month — two of these render side by side (stacked on
 * narrow screens) so the calendar fills the card without each day cell
 * growing to fit the space, and without needing a click just to peek at
 * next month. */
function MonthGrid({
  month,
  today,
  date,
  accent,
  recordedByDate,
  predictedDates,
  onNavigateToDate,
}: {
  month: string;
  today: string;
  date: string;
  accent: string;
  recordedByDate: Map<string, RawPeriodLog>;
  predictedDates: Set<string>;
  onNavigateToDate: (date: string) => void;
}) {
  const grid = useMemo(() => calendarGridDates(month), [month]);
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {formatMonthLabel(month)}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="w-8">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const recorded = recordedByDate.get(d);
          const predicted = !recorded && predictedDates.has(d);
          const isToday = d === today;
          const isSelected = d === date;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onNavigateToDate(d)}
              className="flex h-8 w-8 flex-col items-center justify-center rounded-md text-xs font-medium transition-colors"
              style={{
                background: recorded ? `color-mix(in oklab, ${accent} 55%, var(--surface-1))` : predicted ? `color-mix(in oklab, ${accent} 16%, var(--surface-1))` : "transparent",
                color: recorded ? "#ffffff" : inMonth ? "var(--text-primary)" : "var(--text-muted)",
                border: isSelected ? `2px solid ${accent}` : isToday ? `1px solid ${accent}` : "1px solid transparent",
                // Only a bare (untracked) day dims for being outside the
                // current month — a recorded or predicted day stays at
                // full strength regardless, so a real period logged in
                // the trailing/leading days of the grid never gets
                // mistaken for a dimmer "predicted" one.
                opacity: !recorded && !predicted && !inMonth ? 0.4 : 1,
              }}
            >
              {Number(d.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CycleTab({
  periodLogs,
  date,
  today,
  isDemoData,
  accent,
  onSetDay,
  onClearDay,
  onNavigateToDate,
}: {
  periodLogs: RawPeriodLog[];
  /** The Log page's globally selected day — Current Cycle reads/edits this
   * date's entry, same as every other tab logs against it. */
  date: string;
  today: string;
  isDemoData: boolean;
  accent: string;
  onSetDay: (date: string, intensity: PeriodIntensity, collectionMethods: CollectionMethod[]) => Promise<void>;
  onClearDay: (date: string) => Promise<void>;
  onNavigateToDate: (date: string) => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(date));
  const [pending, setPending] = useState(false);

  const runs = useMemo(() => groupIntoPeriodRuns(periodLogs), [periodLogs]);
  const status = useMemo(() => currentCycleStatus(runs, date), [runs, date]);
  const predictions = useMemo(() => predictUpcomingPeriods(runs, 3, today), [runs, today]);

  const selectedEntry = useMemo(() => periodLogs.find((l) => l.date === date) ?? null, [periodLogs, date]);

  const recordedByDate = useMemo(() => new Map(periodLogs.map((l) => [l.date, l])), [periodLogs]);
  // Shaded band is the expected period only (expectedStart through its
  // typical length) — NOT earliest-to-latest-start plus length. That wider
  // span is real uncertainty info (shown as text under Current Cycle
  // instead), but painting it on the calendar made one predicted period
  // look like an 11+ day blob whenever recent cycles varied at all, and
  // let adjacent predictions visually merge into each other.
  const predictedDates = useMemo(() => {
    const set = new Set<string>();
    for (const p of predictions) {
      let d = p.expectedStart;
      const end = addDaysToDate(p.expectedStart, p.expectedLength - 1);
      while (d <= end) {
        set.add(d);
        d = addDaysToDate(d, 1);
      }
    }
    return set;
  }, [predictions]);

  async function setIntensity(level: PeriodIntensity) {
    if (isDemoData || pending) return;
    setPending(true);
    if (selectedEntry?.intensity === level) {
      await onClearDay(date);
    } else {
      await onSetDay(date, level, selectedEntry?.collectionMethods ?? []);
    }
    setPending(false);
  }

  async function toggleCollectionMethod(method: CollectionMethod) {
    if (isDemoData || pending || !selectedEntry) return;
    setPending(true);
    const methods = selectedEntry.collectionMethods.includes(method)
      ? selectedEntry.collectionMethods.filter((m) => m !== method)
      : [...selectedEntry.collectionMethods, method];
    await onSetDay(date, selectedEntry.intensity, methods);
    setPending(false);
  }

  const secondMonth = useMemo(() => shiftMonth(calendarMonth, 1), [calendarMonth]);
  const thirdMonth = useMemo(() => shiftMonth(calendarMonth, 2), [calendarMonth]);

  return (
    <div className="flex flex-col gap-5">
      {/* ---- 1. Current cycle ---- */}
      <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2" style={{ borderColor: "var(--border-hairline)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {status.onPeriod ? `Day ${status.periodDay} of your period` : status.cycleDay ? `Cycle day ${status.cycleDay}` : "No period recorded yet"}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {formatFullDate(date)}
              {date === today && " · Today"}
            </p>
          </div>
          {!status.onPeriod && predictions[0] && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Next period expected {formatFullDate(predictions[0].expectedStart)}
              {predictions[0].earliestStart !== predictions[0].latestStart && (
                <> (between {formatFullDate(predictions[0].earliestStart)} and {formatFullDate(predictions[0].latestStart)})</>
              )}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Period intensity
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_INTENSITIES.map((level) => (
              <Chip
                key={level}
                label={level}
                icon={<IntensityIcon level={level} />}
                active={selectedEntry?.intensity === level}
                onClick={() => void setIntensity(level)}
                accent={accent}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Collection method
          </p>
          <div className={clsx("flex flex-wrap gap-1.5", !selectedEntry && "opacity-40")}>
            {COLLECTION_METHODS.map((method) => (
              <Chip
                key={method}
                label={method}
                icon={COLLECTION_METHOD_ICON[method]}
                active={Boolean(selectedEntry?.collectionMethods.includes(method))}
                onClick={() => void toggleCollectionMethod(method)}
                accent={accent}
              />
            ))}
          </div>
          {!selectedEntry && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Set a period intensity above first.
            </p>
          )}
        </div>
      </div>

      {/* ---- 2. Period calendar ---- */}
      <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border-hairline)" }}>
          <button
            type="button"
            onClick={() => setCalendarMonth((m) => shiftMonth(m, -1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Previous month"
          >
            ‹
          </button>
          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Period calendar
          </p>
          <button
            type="button"
            onClick={() => setCalendarMonth((m) => shiftMonth(m, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Compact months, not one stretched to the card's full width —
         * fills the space without either the day cells growing or needing
         * an extra click to see what's coming. 2-up down to tablet, 3-up on
         * desktop where there's still room to spare; stacks on mobile. */}
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
          <MonthGrid month={calendarMonth} today={today} date={date} accent={accent} recordedByDate={recordedByDate} predictedDates={predictedDates} onNavigateToDate={onNavigateToDate} />
          <MonthGrid month={secondMonth} today={today} date={date} accent={accent} recordedByDate={recordedByDate} predictedDates={predictedDates} onNavigateToDate={onNavigateToDate} />
          <div className="hidden lg:block">
            <MonthGrid month={thirdMonth} today={today} date={date} accent={accent} recordedByDate={recordedByDate} predictedDates={predictedDates} onNavigateToDate={onNavigateToDate} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `color-mix(in oklab, ${accent} 55%, var(--surface-1))` }} />
            Cycle day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `color-mix(in oklab, ${accent} 16%, var(--surface-1))` }} />
            Predicted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ border: `1px solid ${accent}` }} />
            Today
          </span>
        </div>
      </div>

    </div>
  );
}
