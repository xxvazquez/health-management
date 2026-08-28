"use client";

export interface SectionNavItem {
  id: string;
  label: string;
}

/**
 * Sticky top-level tab bar for a long analytics page — same show-one-
 * section-at-a-time model as the page's own internal sub-tabs (e.g. Food's
 * Ingredients/Categories/Trends), just one level up. Selecting an item
 * swaps which section is rendered rather than scrolling to it, so getting
 * to "Repetition" or "Ingredients" never means scrolling past everything
 * else first.
 *
 * Underlined-text tabs, not filled pills — the same shape as the Log
 * page's own type tab bar and this page's own Ingredients/Categories/
 * Trends sub-tabs below, so a page never mixes two different "this is a
 * tab" shapes at once. See the Log page's TABS bar for the exact pattern
 * this mirrors.
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
  /** One consistent color for every active tab — matching this app's rule
   * that color marks meaning, not just tells N similar things apart (see
   * the Workout page's per-exercise accent for the same principle). Pass a
   * non-default value when the page's own content already leans on the
   * default (e.g. Food, whose charts are already series-1 green). */
  accent?: string;
}) {
  return (
    <nav
      aria-label="Food sections"
      className="no-scrollbar sticky top-16 z-10 flex gap-5 overflow-x-auto border-b bg-[var(--page-backdrop)] lg:top-0"
      style={{ borderColor: "var(--border-hairline)" }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
            style={{
              color: active ? accent : "var(--text-secondary)",
              fontWeight: active ? 700 : 500,
              borderBottom: `2px solid ${active ? accent : "transparent"}`,
              marginBottom: "-1px",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
