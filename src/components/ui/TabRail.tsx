"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import clsx from "clsx";
import { useOverflowFade } from "@/lib/useOverflowFade";

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

/** The app's one secondary-navigation shape: underlined text tabs that swap
 * the surface below (Log's domains, the Personal/Household boards, the
 * Doctors sections, the Analytics domain and section switchers).
 *
 * By default wraps to more rows on a narrow screen so no tab is hidden
 * off-edge; from `sm` up it's a single row that scrolls with a soft edge
 * fade. Pass `wrap={false}` to stay a single scrolling row at every width —
 * for a sticky bar, where an extra wrapped row costs too much height.
 * Every tab sits on a hairline baseline so a wrapped bar reads as a grid.
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
}: {
  items: readonly TabRailItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  wrap?: boolean;
  iconOnly?: boolean;
}) {
  const navRef = useOverflowFade<HTMLElement>();
  const activeRef = useRef<HTMLButtonElement>(null);
  const [longPressId, setLongPressId] = useState<T | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  // Keep the active tab in view when the bar scrolls sideways (it can't fit
  // every tab, so a selection made off-screen would otherwise stay hidden).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
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
        "no-scrollbar fade-x flex items-center gap-x-5",
        wrap
          ? "flex-wrap gap-y-2 sm:flex-nowrap sm:gap-5 sm:overflow-x-auto"
          : "flex-nowrap gap-y-2 overflow-x-auto sm:gap-5",
        className,
      )}
      style={style}
    >
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            ref={active ? activeRef : undefined}
            type="button"
            onClick={() => handleClick(t.id)}
            onPointerDown={(e) => handlePointerDown(e, t.id)}
            onPointerUp={() => clearLongPress(t.id)}
            onPointerLeave={() => clearLongPress(t.id)}
            onPointerCancel={() => clearLongPress(t.id)}
            aria-current={active ? "page" : undefined}
            aria-label={iconOnly ? t.label : undefined}
            className={clsx("group relative flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors", iconOnly && "justify-center")}
            style={{
              color: active ? t.accent : "var(--text-secondary)",
              fontWeight: active ? 700 : 500,
              // Wrapped rows each need their own baseline, so inactive tabs
              // carry a hairline. A single scrolling row sits on one
              // continuous rail (the caller's border-b) instead.
              borderBottom: `2px solid ${active ? t.accent : wrap ? "var(--border-hairline)" : "transparent"}`,
              marginBottom: wrap ? undefined : "-1px",
            }}
          >
            {iconOnly ? (
              <>
                {t.icon}
                <span
                  role="tooltip"
                  className={clsx(
                    "pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 -translate-x-1/2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
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
