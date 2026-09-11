"use client";

import { TabRail } from "@/components/ui/TabRail";

export interface SectionNavItem {
  id: string;
  label: string;
}

/**
 * Section switcher for a long analytics dashboard — same show-one-section-
 * at-a-time model as the page's own domain tabs, one level down. Selecting
 * an item swaps which section renders rather than scrolling to it, so
 * getting to "Repetition" or "Ingredients" never means scrolling past
 * everything else first.
 *
 * A thin wrapper over `TabRail` (the app's one tab shape) that stays pinned
 * while a long section scrolls — below the app header on mobile, below the
 * page's own domain switcher on `lg` — and gives every active tab one
 * consistent accent, matching the rule that colour marks meaning.
 */
export function SectionNav({
  items,
  activeId,
  onSelect,
  accent = "var(--ui-accent)",
}: {
  items: SectionNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** One consistent colour for every active tab. Pass a non-default value
   * when the page's own content already leans on a domain hue (e.g. Food,
   * whose charts are already series-1 green). */
  accent?: string;
}) {
  return (
    <TabRail
      ariaLabel="Dashboard sections"
      items={items.map((item) => ({ ...item, accent }))}
      activeId={activeId}
      onSelect={onSelect}
      wrap={false}
      className="sticky top-0 z-10 -mx-4 border-b border-[color:var(--border-hairline)] bg-[var(--page-backdrop)] px-4 pt-3 sm:-mx-6 sm:px-6 lg:top-8 lg:mx-0 lg:px-0"
    />
  );
}
