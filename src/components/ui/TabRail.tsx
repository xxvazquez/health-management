"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import clsx from "clsx";
import { useOverflowFade } from "@/lib/useOverflowFade";
import { useRovingTabs } from "@/lib/useRovingTabs";

export interface TabRailItem<T extends string = string> {
  id: T;
  label: string;
  /** Optional leading icon — shown from `sm` up only, hidden on the narrow
   * wrapped layout where the label alone has to earn its width. Required
   * (in practice) when `iconOnly` is set, since the label no longer renders
   * on its own. */
  icon?: ReactNode;
  /** Active-state colour for this tab's label and underline. */
  accent: string;
}

const LONG_PRESS_MS = 500;

/** Underlined text tabs that swap the surface below. Now used one level
 * down only — the analytics dashboards' section switchers (`SectionNav`);
 * the page-level view switchers (Log, Trends, Health, Notes) moved to
 * `SegmentedTabs`, the iOS segmented control.
 *
 * By default wraps to more rows on a narrow screen so no tab is hidden
 * off-edge; from `sm` up it's a single row that scrolls with a soft edge
 * fade. Pass `wrap={false}` to stay a single scrolling row at every width —
 * for a sticky bar, where an extra wrapped row costs too much height.
 * Every tab sits on a hairline baseline so a wrapped bar reads as a grid;
 * a single row draws that baseline itself, so callers add no border.
 *
 * `iconOnly` swaps the label for just the icon at every width (instead of
 * hiding the icon below `sm`) — a tap still switches the tab immediately;
 * the label surfaces as a small tooltip on hover (desktop) or on a
 * long-press that doesn't also trigger the tab switch (touch), same
 * underlying "reveal without navigating" behavior either way. Only pass
 * this where every item actually has an `icon` — `SectionNav`'s bare
 * label-only rails don't, and stay on the default label rendering.
 *
 * `className` / `style` are merged onto the `<nav>` for callers that need it
 * sticky, bled to the page edge, or sharing a flex row. */
export function TabRail<T extends string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className,
  style,
  wrap = true,
  iconOnly = false,
  tall = false,
}: {
  items: readonly TabRailItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  wrap?: boolean;
  iconOnly?: boolean;
  /** 44px tap height, for a rail that is the primary way to move around. */
  tall?: boolean;
}) {
  const navRef = useOverflowFade<HTMLElement>();
  const activeRef = useRef<HTMLButtonElement>(null);
  const ids = items.map((t) => t.id);
  const { registerRef, handleKeyDown, tabIndex } = useRovingTabs(ids, activeId, onSelect);
  const [longPressId, setLongPressId] = useState<T | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  // Keep the active tab in view when the bar scrolls sideways (it can't fit
  // every tab, so a selection made off-screen would otherwise stay hidden).
  // Scrolls the rail sideways only — scrollIntoView would also nudge the
  // rail and the page vertically.
  useEffect(() => {
    const tab = activeRef.current;
    const rail = tab?.parentElement;
    if (!tab || !rail || rail.scrollWidth <= rail.clientWidth) return;
    const offset = tab.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    rail.scrollTo({ left: rail.scrollLeft + offset - (rail.clientWidth - tab.offsetWidth) / 2 });
  }, [activeId]);

  function clearLongPress(id: T) {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    setLongPressId((current) => (current === id ? null : current));
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: T) {
    if (!iconOnly || (e.pointerType !== "touch" && e.pointerType !== "pen")) return;
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setLongPressId(id);
    }, LONG_PRESS_MS);
  }

  function handleClick(id: T) {
    // A long-press already showed the label without switching — the
    // pointerup that follows still fires a click, which this swallows once
    // rather than also treating the same gesture as "pick this tab."
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onSelect(id);
  }

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={clsx(
        "no-scrollbar fade-x flex items-center gap-x-5 touch-pan-x",
        // A scrolling row moves sideways only — each tab's invisible 44px
        // tap area reaches past the row and would otherwise let it scroll
        // up and down too.
        wrap
          ? "flex-wrap gap-y-2 sm:flex-nowrap sm:gap-5 sm:overflow-x-auto sm:overflow-y-hidden"
          : "flex-nowrap gap-y-2 overflow-x-auto overflow-y-hidden sm:gap-5",
        className,
      )}
      // A single row draws its baseline as an inset shadow, which takes no
      // height: a real border would leave the 44px tabs 1px taller than the
      // scroller's inside, and it would then scroll vertically too.
      style={wrap ? style : { boxShadow: "inset 0 -1px 0 var(--border-hairline)", ...style }}
    >
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (active) activeRef.current = el;
              registerRef(t.id)(el);
            }}
            type="button"
            onClick={() => handleClick(t.id)}
            onKeyDown={(e) => handleKeyDown(e, t.id)}
            tabIndex={tabIndex(t.id)}
            onPointerDown={(e) => handlePointerDown(e, t.id)}
            onPointerUp={() => clearLongPress(t.id)}
            onPointerLeave={() => clearLongPress(t.id)}
            onPointerCancel={() => clearLongPress(t.id)}
            aria-current={active ? "page" : undefined}
            aria-label={iconOnly ? t.label : undefined}
            className={clsx("group relative flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap transition-colors", tall ? "min-h-11" : "hit-slop pb-2.5", iconOnly && "justify-center")}
            style={{
              color: active ? t.accent : "var(--text-secondary)",
              fontWeight: active ? 600 : 500,
              // Wrapped rows each need their own baseline, so inactive tabs
              // carry a hairline. A single scrolling row sits on the rail's
              // own baseline instead (see the nav's box-shadow).
              borderBottom: `2px solid ${active ? t.accent : wrap ? "var(--border-hairline)" : "transparent"}`,
            }}
          >
            {iconOnly ? (
              <>
                {t.icon}
                <span
                  role="tooltip"
                  className={clsx(
                    "pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 -translate-x-1/2 min-h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
                    longPressId === t.id && "opacity-100",
                  )}
                  style={{ background: "var(--text-primary)", color: "var(--surface-1)" }}
                >
                  {t.label}
                </span>
              </>
            ) : (
              <>
                {t.icon && <span className="hidden sm:inline-flex">{t.icon}</span>}
                {t.label}
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
