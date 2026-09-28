"use client";

import type { ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

/** The building blocks every Trends page is made of: iOS inset-grouped
 * sections of one-line rows (name left, one value right, an optional thin
 * bar under), split stat cards, and Health-style this-vs-before
 * comparisons. One shape everywhere, so pages scan the same way. */

/** The previous period in a comparison — a quiet grey next to the coloured "now". */
const BEFORE_COLOR = "color-mix(in oklab, var(--text-muted) 40%, var(--surface-1))";

const GROUP_STYLE = { borderColor: "var(--border-hairline)", background: "var(--surface-1)" } as const;

export function TrendCaption({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <h3 className="px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: color ?? "var(--text-muted)" }}>
      {children}
    </h3>
  );
}

/** A captioned inset-grouped card of rows, with an optional quiet note under it. */
export function TrendGroup({ caption, captionColor, note, children }: { caption?: ReactNode; captionColor?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {caption && <TrendCaption color={captionColor}>{caption}</TrendCaption>}
      <div className="inset-rows overflow-hidden rounded-xl border" style={GROUP_STYLE}>
        {children}
      </div>
      {note && (
        <p className="px-3.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
    </section>
  );
}

/** A thin horizontal bar, `pct` of the track filled. */
export function TrendBar({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="block h-[5px] w-full overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}

/** One row: label (and optional second line) left, value right, an optional
 * bar under the whole row, and a chevron when it opens something. */
export function TrendRow({
  label,
  sublabel,
  value,
  bar,
  onClick,
}: {
  label: ReactNode;
  sublabel?: ReactNode;
  value?: ReactNode;
  bar?: { pct: number; color: string };
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          {sublabel && (
            <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
              {sublabel}
            </span>
          )}
        </span>
        {value != null && (
          <span className="shrink-0 text-right text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {value}
          </span>
        )}
        {onClick && (
          <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
            <ChevronIcon dir="right" size={14} />
          </span>
        )}
      </span>
      {bar && (
        <span className="mt-1.5 block">
          <TrendBar pct={bar.pct} color={bar.color} />
        </span>
      )}
    </>
  );
  const cls = "block min-h-11 w-full px-3.5 py-2.5 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The "Show all N" / "Show fewer" row closing a trimmed list. */
export function ShowAllRow({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="block min-h-11 w-full px-3.5 text-left text-sm" style={{ color: "var(--ui-accent)" }}>
      {expanded ? "Show fewer" : `Show all ${total}`}
    </button>
  );
}

export interface SplitStatItem {
  caption: string;
  value: string;
  unit?: string;
  detail?: string;
  detailColor?: string;
}

/** One card split into equal halves (or thirds), each a caption over a big
 * number and one quiet line. */
export function SplitStatCard({ items }: { items: SplitStatItem[] }) {
  return (
    <div className="grid overflow-hidden rounded-xl border" style={{ ...GROUP_STYLE, gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={it.caption} className="min-w-0 px-3.5 py-3" style={i > 0 ? { borderLeft: "1px solid var(--border-hairline)" } : undefined}>
          <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            {it.caption}
          </p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-2xl leading-tight font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {it.value}
            </span>
            {it.unit && (
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {it.unit}
              </span>
            )}
          </p>
          {it.detail && (
            <p className="text-xs" style={{ color: it.detailColor ?? "var(--text-secondary)" }}>
              {it.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A row comparing the previous period (grey bar) with now (coloured bar),
 * each with its count — the Apple Health comparison. */
export function ComparisonRow({ label, before, now, max, color }: { label: ReactNode; before: number; now: number; max: number; color: string }) {
  const pct = (n: number) => (max > 0 ? (n / max) * 100 : 0);
  return (
    <div className="grid min-h-11 grid-cols-[minmax(0,7rem)_1fr] items-center gap-3 px-3.5 py-2.5">
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="grid grid-cols-[1fr_1.75rem] items-center gap-x-2 gap-y-1">
        <TrendBar pct={pct(before)} color={BEFORE_COLOR} />
        <span className="text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {before}
        </span>
        <TrendBar pct={pct(now)} color={color} />
        <span className="text-right text-xs tabular-nums" style={{ color: "var(--text-primary)" }}>
          {now}
        </span>
      </span>
    </div>
  );
}

/** The one-line key under a comparison section. */
export function ComparisonKey({ color, unit }: { color: string; unit: string }) {
  const swatch = (c: string) => <span className="mr-1 inline-block h-1.5 w-2.5 rounded-full align-middle" style={{ background: c }} aria-hidden="true" />;
  return (
    <p className="flex gap-3 px-3.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span>{swatch(BEFORE_COLOR)}Before</span>
      <span>{swatch(color)}Now</span>
      <span className="ml-auto">{unit}</span>
    </p>
  );
}
