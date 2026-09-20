"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronIcon } from "@/components/ui/icons";
import { daysInMonth, mondayIndexOfFirst, monthName, parseISODate, toISODate, todayISO } from "./dateUtils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** A 12-month grid with a year stepper — used on its own for month pickers
 * and as the drill-down when the calendar's month title is tapped. */
export function MonthGrid({
  year,
  month,
  maxYM,
  minYM,
  onYear,
  onPick,
}: {
  year: number;
  /** Selected month (0–11) when it falls in `year`, otherwise -1. */
  month: number;
  minYM?: string;
  maxYM?: string;
  onYear: (year: number) => void;
  onPick: (year: number, month: number) => void;
}) {
  const ym = (m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous year" onClick={() => onYear(year - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: "var(--text-secondary)" }}>
          <ChevronIcon dir="left" size={16} />
        </button>
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {year}
        </span>
        <button type="button" aria-label="Next year" onClick={() => onYear(year + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: "var(--text-secondary)" }}>
          <ChevronIcon dir="right" size={16} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, m) => {
          const disabled = (maxYM != null && ym(m) > maxYM) || (minYM != null && ym(m) < minYM);
          const selected = m === month;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onPick(year, m)}
              className="min-h-10 rounded-lg text-sm transition-colors disabled:opacity-30"
              style={{
                background: selected ? "var(--ui-accent)" : "transparent",
                color: selected ? "var(--on-accent)" : "var(--text-primary)",
                fontWeight: selected ? 600 : 400,
              }}
            >
              {monthName(m, "short")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The month calendar: Monday-first day grid, prev/next month, and a tap on
 * the title to jump to another month or year. Reports a picked day as
 * `YYYY-MM-DD`; days outside `min`/`max` are disabled. */
export function Calendar({
  value,
  min,
  max,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (iso: string) => void;
}) {
  const selected = parseISODate(value);
  const today = todayISO();
  const start = selected ?? parseISODate(today)!;
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [drill, setDrill] = useState(false);
  // One tab stop for the whole grid (the selected day, else today, else the
  // 1st); arrow keys move it, PageUp/PageDown change month.
  const [focusIso, setFocusIso] = useState(value || today);
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocus = useRef(false);

  useEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current = false;
      dayRefs.current[focusIso]?.focus();
    }
  });

  function moveFocus(from: string, days: number, months = 0) {
    const p = parseISODate(from);
    if (!p) return;
    const d = new Date(p.y, p.m + months, p.d + days);
    const iso = toISODate(d.getFullYear(), d.getMonth(), d.getDate());
    if ((min != null && iso < min) || (max != null && iso > max)) return;
    pendingFocus.current = true;
    setFocusIso(iso);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  function handleKey(e: React.KeyboardEvent, iso: string) {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [-7, 0],
      ArrowDown: [7, 0],
      PageUp: [0, -1],
      PageDown: [0, 1],
    };
    const move = step[e.key];
    if (!move) return;
    e.preventDefault();
    moveFocus(iso, move[0], move[1]);
  }

  function shift(delta: number) {
    setView((v) => {
      const idx = v.y * 12 + v.m + delta;
      return { y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 };
    });
  }

  if (drill) {
    return (
      <MonthGrid
        year={view.y}
        month={view.m}
        minYM={min?.slice(0, 7)}
        maxYM={max?.slice(0, 7)}
        onYear={(y) => setView((v) => ({ ...v, y }))}
        onPick={(y, m) => {
          setView({ y, m });
          setDrill(false);
        }}
      />
    );
  }

  const lead = mondayIndexOfFirst(view.y, view.m);
  const total = daysInMonth(view.y, view.m);
  const viewPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const tabIso = focusIso.startsWith(viewPrefix) ? focusIso : toISODate(view.y, view.m, 1);
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setDrill(true)} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {monthName(view.m)} {view.y}
          <span aria-hidden="true" style={{ color: "var(--ui-accent)" }}>
            <ChevronIcon dir="right" size={12} />
          </span>
        </button>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: "var(--ui-accent)" }}>
            <ChevronIcon dir="left" size={16} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: "var(--ui-accent)" }}>
            <ChevronIcon dir="right" size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (d == null) return <span key={`b${i}`} />;
          const iso = toISODate(view.y, view.m, d);
          const disabled = (min != null && iso < min) || (max != null && iso > max);
          const isSel = iso === value;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              ref={(el) => {
                dayRefs.current[iso] = el;
              }}
              type="button"
              disabled={disabled}
              aria-pressed={isSel}
              aria-label={new Date(view.y, view.m, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              data-date={iso}
              tabIndex={iso === tabIso ? 0 : -1}
              onKeyDown={(e) => handleKey(e, iso)}
              onClick={() => onPick(iso)}
              className={clsx("mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm tabular-nums transition-colors disabled:opacity-30")}
              style={{
                background: isSel ? "var(--ui-accent)" : "transparent",
                color: isSel ? "var(--on-accent)" : isToday ? "var(--ui-accent)" : "var(--text-primary)",
                fontWeight: isSel || isToday ? 600 : 400,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
