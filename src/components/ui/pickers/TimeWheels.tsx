"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { pad2 } from "./dateUtils";

const ROW = 36;
const VIEW = 176;
const PAD = (VIEW - ROW) / 2;

/** One scrolling picker column over indices 0…count-1; `format` turns an
 * index into its label (two-digit by default, for times). */
export function Wheel({
  count,
  value,
  onChange,
  label,
  format = pad2,
  width = 64,
}: {
  count: number;
  value: number;
  onChange: (n: number) => void;
  label: string;
  format?: (i: number) => string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrolling = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the wheel parked on the value unless the user is mid-scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el || scrolling.current) return;
    const target = value * ROW;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  }, [value]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    if (scrolling.current) clearTimeout(scrolling.current);
    scrolling.current = setTimeout(() => {
      scrolling.current = null;
      const idx = Math.min(count - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (idx !== value) onChange(idx);
    }, 90);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={handleScroll}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.min(count - 1, value + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.max(0, value - 1));
        }
      }}
      className="no-scrollbar relative snap-y snap-mandatory overflow-y-auto outline-none"
      style={{ width, height: VIEW, paddingTop: PAD, paddingBottom: PAD }}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="option"
          aria-selected={i === value}
          onClick={() => {
            onChange(i);
            ref.current?.scrollTo({ top: i * ROW, behavior: "smooth" });
          }}
          className="flex w-full snap-center items-center justify-center text-sm tabular-nums"
          style={{
            height: ROW,
            color: i === value ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: i === value ? 600 : 400,
          }}
        >
          {format(i)}
        </button>
      ))}
    </div>
  );
}

/** Wheels side by side over one shared selection band. */
export function WheelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex w-fit items-center justify-center gap-1" style={{ height: VIEW }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-lg" style={{ top: PAD, height: ROW, background: "var(--field-fill)", zIndex: 0 }} />
      <div className="relative z-10 flex items-center">{children}</div>
    </div>
  );
}

/** Hour and minute wheels — scroll (or tap, or use the arrow keys) to set the
 * time. `value` and `onChange` use `HH:mm`. */
export function TimeWheels({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const [hh, mm] = /^(\d{1,2}):(\d{2})/.test(value) ? value.split(":").map(Number) : [0, 0];
  return (
    <WheelFrame>
      <Wheel count={24} value={hh} onChange={(h) => onChange(`${pad2(h)}:${pad2(mm)}`)} label="Hours" />
      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        :
      </span>
      <Wheel count={60} value={mm} onChange={(m) => onChange(`${pad2(hh)}:${pad2(m)}`)} label="Minutes" />
    </WheelFrame>
  );
}
