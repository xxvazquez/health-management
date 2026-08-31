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
 * A thin wrapper over `TabRail` (the app's one tab shape) that pins it just
 * below the page's own sticky domain switcher on `lg`, and gives every
 * active tab one consistent accent — matching the rule that colour marks
 * meaning, not just tells N similar things apart.
 */
export function SectionNav({
  items,
  activeId,
  onSelect,
  accent = "var(--series-1)",
}: {
  items: SectionNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** One consistent colour for every active tab. Pass a non-default value
   * when the page's own content already leans on the default (e.g. Food,
   * whose charts are already series-1 green). */
  accent?: string;
}) {
  return (
    <TabRail
      ariaLabel="Dashboard sections"
      items={items.map((item) => ({ ...item, accent }))}
      activeId={activeId}
      onSelect={onSelect}
      className="bg-[var(--page-backdrop)] lg:sticky lg:top-8 lg:z-10"
    />
  );
}
