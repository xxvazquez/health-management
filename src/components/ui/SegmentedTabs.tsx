"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  /** Active-label tint — a small Lauva touch on the otherwise-neutral iOS
   * shape. Defaults to the primary text colour. */
  accent?: string;
}

const BASE = "min-w-0 truncate rounded-md px-3 py-1.5 text-center text-sm transition-colors";

function segmentStyle(active: boolean, accent?: string): CSSProperties {
  return {
    background: active ? "var(--surface-1)" : "transparent",
    color: active ? accent ?? "var(--text-primary)" : "var(--text-muted)",
    boxShadow: active ? "var(--shadow-card)" : "none",
    fontWeight: active ? 600 : 500,
  };
}

/** The page-level view switcher — an iOS segmented control. When the
 * segments don't all fit, the ones past the edge fold into a trailing
 * "More" segment that opens a menu (and shows the active label itself
 * when the active view is one of the hidden ones).
 *
 * Deeper, in-content section switchers (`SectionNav`, the Doctors
 * sub-tabs) stay on `TabRail`'s underlined style — different level, on
 * purpose. */
export function SegmentedTabs<T extends string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className,
  style,
}: {
  items: readonly SegmentedTabItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  // True when every segment can render as an equal `flex-1` share of the
  // track without the longest label clipping. False means visibleCount was
  // instead reached by summing each segment's own natural width — which
  // can still land on visibleCount === items.length (everything fits, just
  // not evenly) as easily as on a real overflow, so it must render at
  // natural width either way; see the `hasOverflow` comment below for why
  // that count alone can't tell the two apart.
  const [equalShare, setEqualShare] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // How many segments fit at their natural label widths — remeasured on
  // resize. Starts at the full set so a wide layout never flashes collapsed.
  useEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;

    const compute = () => {
      const samples = Array.from(measure.children) as HTMLElement[];
      const widths = samples.slice(0, items.length).map((s) => s.offsetWidth);
      const withChevronWidths = samples.slice(items.length, items.length * 2).map((s) => s.offsetWidth);
      const morePlaceholderW = samples[samples.length - 1]?.offsetWidth ?? 60;
      // Once one of the overflowed items is active, the trailing segment
      // shows THAT item's own label (+ chevron) instead of "More" — so the
      // width reserved for it here has to cover the widest label any item
      // could contribute, not just the "More" placeholder itself, or
      // selecting a long-named item later pushes the whole bar past the
      // container edge (see the Log page tab strip overflowing on
      // "Workout"/"Cycle").
      const moreW = Math.max(morePlaceholderW, ...withChevronWidths);
      const avail = root.clientWidth - 4; // track padding
      // When nothing overflows, every segment renders `flex-1` — an equal
      // share of `avail`, not its own natural width. So "everything fits"
      // has to mean the longest label still clears that equal share, not
      // just that the widths sum to less than avail (which let a couple of
      // long labels among several short ones get squeezed and truncate).
      const maxWidth = widths.length > 0 ? Math.max(...widths) : 0;
      if (maxWidth * items.length <= avail) {
        setVisibleCount(items.length);
        setEqualShare(true);
        return;
      }
      // Equal share doesn't work (the longest label wouldn't clear its
      // share), so fall back to packing segments at their own natural
      // width instead — this can still fit every item (just unevenly
      // sized) rather than actually needing to fold any into "More".
      let used = 0;
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        if (used + widths[i] + moreW > avail) break;
        used += widths[i];
        n += 1;
      }
      setVisibleCount(Math.max(1, n));
      setEqualShare(false);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    // The fallback font Lauva ships isn't preloaded (see globals.css), so
    // the very first `compute()` can run against its narrower metrics
    // before the real webfont swaps in. `root`'s own box doesn't change
    // size from that swap, so ResizeObserver alone wouldn't catch a label
    // that measures differently once the real font lands — recompute once
    // fonts are actually ready too.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) compute();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [items]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const hasOverflow = visibleCount < items.length;
  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);
  const activeInOverflow = overflow.find((t) => t.id === activeId);

  return (
    // The outer element is full-width; the track hugs its content instead
    // (natural widths, never truncating) whenever an equal share wouldn't
    // fit the longest label — whether or not that also means some segments
    // folded into "More". Only a genuine equal share fills the bar.
    <div ref={rootRef} className={clsx("relative", className)} style={style}>
      <div
        aria-label={ariaLabel}
        className={clsx("flex items-stretch gap-0.5 rounded-lg p-0.5", equalShare ? "w-full" : "w-fit")}
        style={{ background: "var(--segment-track)" }}
      >
        {visible.map((t) => {
          const active = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(t.id)}
              className={clsx(BASE, equalShare ? "flex-1" : "shrink-0")}
              style={segmentStyle(active, t.accent)}
            >
              {t.label}
            </button>
          );
        })}

        {hasOverflow && (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={clsx(BASE, "flex flex-none items-center justify-center gap-1")}
            style={segmentStyle(Boolean(activeInOverflow), activeInOverflow?.accent)}
          >
            <span className="truncate">{activeInOverflow ? activeInOverflow.label : "More"}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 z-30 mt-1 flex max-h-72 min-w-40 flex-col overflow-y-auto rounded-lg border py-1 shadow-lg"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          {overflow.map((t) => {
            const active = t.id === activeId;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onSelect(t.id);
                  setMenuOpen(false);
                }}
                className="px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--page-plane)]"
                style={{ color: active ? t.accent ?? "var(--text-primary)" : "var(--text-secondary)", fontWeight: active ? 600 : 500 }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Hidden natural-width copies of every label (plain, and again with
          the trailing chevron they'd carry as the active overflow label),
          plus a "More" sample — measured to decide how many segments fit. */}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none absolute -z-10 flex opacity-0" style={{ left: 0, top: 0 }}>
        {items.map((t) => (
          <span key={`plain-${t.id}`} className={clsx(BASE, "whitespace-nowrap")}>
            {t.label}
          </span>
        ))}
        {items.map((t) => (
          <span key={`chevron-${t.id}`} className={clsx(BASE, "flex items-center gap-1 whitespace-nowrap")}>
            {t.label}
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </span>
        ))}
        <span className={clsx(BASE, "flex items-center gap-1 whitespace-nowrap")}>
          More
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </span>
      </div>
    </div>
  );
}
