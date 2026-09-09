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
  const [menuOpen, setMenuOpen] = useState(false);

  // How many segments fit at their natural label widths — remeasured on
  // resize. Starts at the full set so a wide layout never flashes collapsed.
  useEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;

    const compute = () => {
      const samples = Array.from(measure.children) as HTMLElement[];
      const moreW = samples[samples.length - 1]?.offsetWidth ?? 60;
      const widths = samples.slice(0, items.length).map((s) => s.offsetWidth);
      const avail = root.clientWidth - 4; // track padding
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= avail) {
        setVisibleCount(items.length);
        return;
      }
      let used = 0;
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        if (used + widths[i] + moreW > avail) break;
        used += widths[i];
        n += 1;
      }
      setVisibleCount(Math.max(1, n));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    return () => ro.disconnect();
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
    // The outer element is full-width; the track hugs its content only when
    // some segments have folded into "More" (so those left are content-sized
    // and never truncate). With everything visible the segments fill the bar.
    <div ref={rootRef} className={clsx("relative", className)} style={style}>
      <div
        aria-label={ariaLabel}
        className={clsx("flex items-stretch gap-0.5 rounded-lg p-0.5", hasOverflow ? "w-fit" : "w-full")}
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
              className={clsx(BASE, hasOverflow ? "shrink-0" : "flex-1")}
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

      {/* Hidden natural-width copies of every label (+ a "More" sample),
          measured to decide how many segments fit. */}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none absolute -z-10 flex opacity-0" style={{ left: 0, top: 0 }}>
        {items.map((t) => (
          <span key={t.id} className={clsx(BASE, "whitespace-nowrap")}>
            {t.label}
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
