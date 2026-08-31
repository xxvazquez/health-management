"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { useOverflowFade } from "@/lib/useOverflowFade";

export interface TabRailItem<T extends string = string> {
  id: T;
  label: string;
  /** Optional leading icon — shown from `sm` up only, hidden on the narrow
   * wrapped layout where the label alone has to earn its width. */
  icon?: ReactNode;
  /** Active-state colour for this tab's label and underline. */
  accent: string;
}

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
}: {
  items: readonly TabRailItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  wrap?: boolean;
}) {
  const navRef = useOverflowFade<HTMLElement>();
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the active tab in view when the bar scrolls sideways (it can't fit
  // every tab, so a selection made off-screen would otherwise stay hidden).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

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
            onClick={() => onSelect(t.id)}
            aria-current={active ? "page" : undefined}
            className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
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
            {t.icon && <span className="hidden sm:inline-flex">{t.icon}</span>}
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
