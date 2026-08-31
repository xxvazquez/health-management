"use client";

import type { CSSProperties, ReactNode } from "react";
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
 * Wraps to more rows on a narrow screen so no tab is ever hidden off-edge;
 * from `sm` up it's a single row that scrolls with a soft edge fade when it
 * can't fit. Every tab — active or not — sits on a hairline baseline, so a
 * wrapped bar reads as a tidy grid rather than one underline floating
 * mid-block.
 *
 * `className` / `style` are merged onto the `<nav>` for the callers that
 * need it sticky, bled to the page edge, or sharing a flex row. */
export function TabRail<T extends string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className,
  style,
}: {
  items: readonly TabRailItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const navRef = useOverflowFade<HTMLElement>();
  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={clsx(
        "no-scrollbar fade-x flex flex-wrap items-center gap-x-5 gap-y-2 sm:flex-nowrap sm:gap-5 sm:overflow-x-auto",
        className,
      )}
      style={style}
    >
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={active ? "page" : undefined}
            className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
            style={{
              color: active ? t.accent : "var(--text-secondary)",
              fontWeight: active ? 700 : 500,
              borderBottom: `2px solid ${active ? t.accent : "var(--border-hairline)"}`,
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
