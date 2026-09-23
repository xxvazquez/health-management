"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { useRovingTabs } from "@/lib/useRovingTabs";

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  /** Active-label tint — a small Lauva touch on the otherwise-neutral iOS
   * shape. Defaults to the primary text colour. */
  accent?: string;
}

const BASE = "hit-slop min-w-0 truncate rounded-lg px-2.5 py-1.5 text-center text-sm transition-colors";

function segmentStyle(active: boolean, accent?: string): CSSProperties {
  return {
    color: active ? accent ?? "var(--text-primary)" : "var(--text-secondary)",
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
  // track without the longest label clipping. False means the segments size
  // to their own labels and grow to fill the track — which can still show
  // every item, just unevenly sized.
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
      // slot reserved for it has to cover the widest label among the items
      // that would actually overflow (see `moreSlot` below), or selecting a
      // long-named one later pushes the bar past the container edge.
      const avail = root.clientWidth - 4; // track padding
      // A few px of slack on every reservation below — the hidden measuring
      // copies and the real flex-laid-out segments can land a couple of
      // pixels apart (subpixel flex rounding, a font metric not fully
      // settled yet), and without slack that gap was enough for `truncate`
      // to clip a letter off an otherwise-fitting label.
      const SLACK = 6;
      // When nothing overflows, every segment renders `flex-1` — an equal
      // share of `avail`, not its own natural width. So "everything fits"
      // has to mean the longest label still clears that equal share, not
      // just that the widths sum to less than avail (which let a couple of
      // long labels among several short ones get squeezed and truncate).
      const maxWidth = widths.length > 0 ? Math.max(...widths) : 0;
      if ((maxWidth + SLACK) * items.length <= avail) {
        setVisibleCount(items.length);
        setEqualShare(true);
        return;
      }
      // Not every item clears an equal share. Before falling back to
      // natural-width segments — which visibly mismatches a short label
      // like "Food" against a longer one like "Symptoms" — look for a
      // smaller visible count whose own labels DO clear an equal share,
      // with the trailing "More"/active-overflow segment as one of those
      // equal shares too rather than a separately-sized leftover slot. An
      // iOS segmented control keeps every segment the same width, folded
      // one included, so there's never a stray gap next to it.
      const gap = 2;
      for (let n = items.length - 1; n >= 1; n--) {
        const trailingWidth = Math.max(morePlaceholderW, ...withChevronWidths.slice(n));
        const share = (avail - n * gap) / (n + 1);
        const maxVisibleWidth = Math.max(...widths.slice(0, n));
        if (share >= maxVisibleWidth + SLACK && share >= trailingWidth + SLACK) {
          setVisibleCount(n);
          setEqualShare(true);
          return;
        }
      }
      // Equal share doesn't work even at a single visible segment — fall
      // back to packing segments at their own natural width instead — this
      // can still fit every item (just unevenly sized) rather than
      // actually needing to fold any into "More".
      let used = 0;
      let n = 0;
      for (let i = 0; i < items.length - 1; i++) {
        used += widths[i] + SLACK + gap;
        const moreSlot = Math.max(morePlaceholderW, ...withChevronWidths.slice(i + 1));
        if (used + moreSlot <= avail) n = i + 1;
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

  // The roving tab stop has to land on a rendered segment — when the active
  // item is folded into "More" instead, that trigger button already has its
  // own ordinary tab stop, so the visible row falls back to its first item.
  const visibleIds = visible.map((t) => t.id);
  const rovingActiveId = activeInOverflow ? (visibleIds[0] ?? activeId) : activeId;
  const { registerRef, handleKeyDown, tabIndex } = useRovingTabs(visibleIds, rovingActiveId, onSelect);

  return (
    // The track always spans the full width: an equal share per segment when
    // the longest label clears it, otherwise natural-width segments that grow
    // to fill the leftover space.
    <div ref={rootRef} className={clsx("relative", className)} style={style}>
      <div
        aria-label={ariaLabel}
        className="flex w-full items-stretch gap-0.5 rounded-[10px] p-0.5"
        style={{ background: "var(--segment-track)", boxShadow: "inset 0 0 0 0.5px var(--border-hairline)" }}
      >
        {visible.map((t) => {
          const active = t.id === activeId;
          return (
            <button
              key={t.id}
              ref={registerRef(t.id)}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => handleKeyDown(e, t.id)}
              tabIndex={tabIndex(t.id)}
              className={clsx(BASE, equalShare ? "flex-1" : "flex-auto", active && "control-surface")}
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
            className={clsx(BASE, "flex items-center justify-center gap-1", equalShare ? "flex-1" : "flex-auto", activeInOverflow && "control-surface")}
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
        <>
          <div className="fixed inset-0 z-20 bg-black/20" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <div
            ref={menuRef}
            className="absolute right-0 z-30 mt-1.5 min-w-40 rounded-lg border shadow-lg"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
          >
            <div className="flex max-h-72 flex-col overflow-y-auto py-1">
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
          </div>
        </>
      )}

      {/* Hidden natural-width copies of every label (plain, and again with
          the trailing chevron they'd carry as the active overflow label),
          plus a "More" sample — measured to decide how many segments fit.
          The outer box is pinned to 0x0 and clipped so this row's full
          unwrapped width (every label laid out in one line, easily
          1000px+) can't inflate the document's scrollable width — on iOS
          that made the whole page pannable off to the side, since html can
          no longer clip overflow itself (see globals.css's overflow-x
          comment). The clip has to sit on this wrapper, not the flex row
          itself: constraining the row's own width would force its
          `min-w-0 truncate` children through real flex-shrink instead of
          just being clipped, collapsing every label before its offsetWidth
          gets read. The inner row is `width: max-content` rather than left
          auto — a plain block would otherwise inherit the 0-width
          available space from this 0-sized wrapper and hit the very same
          collapse — so it sizes to its own content regardless of the
          wrapper, and each span still renders (and measures) at its true
          natural width. */}
      <div aria-hidden="true" className="pointer-events-none absolute -z-10 overflow-hidden opacity-0" style={{ left: 0, top: 0, width: 0, height: 0 }}>
        <div ref={measureRef} className="flex" style={{ width: "max-content" }}>
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
    </div>
  );
}
