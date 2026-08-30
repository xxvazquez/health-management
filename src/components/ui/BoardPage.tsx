"use client";

import type { ReactNode } from "react";
import { TAB_ICON } from "@/components/tabIcons";

export interface BoardPageTab {
  id: string;
  label: string;
  /** Key into `TAB_ICON`. */
  icon: string;
  /** Active-state colour for the label and underline. Pass the same value
   * for every tab for a single-hue page (Household), or a distinct hue per
   * section (Personal). */
  accent: string;
}

interface BoardPageProps {
  title: string;
  /** Hero rule and tab-bar underline tint — usually the active tab's accent. */
  accent: string;
  tabs: BoardPageTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  /** Optional line under the tab bar, e.g. the "example data" demo notice. */
  notice?: ReactNode;
  children: ReactNode;
}

/** Shared shell for the Household and Personal pages: a title with the
 * coloured left rule, a horizontally-scrolling underlined tab bar, and the
 * active board below. Keeps the two pages structurally identical — only the
 * tab set, colours, and board content differ. */
export function BoardPage({ title, accent, tabs, activeTab, onSelectTab, notice, children }: BoardPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-l-[3px] pl-2.5" style={{ borderColor: accent }}>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
      </div>

      <nav
        className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b"
        style={{ borderColor: `color-mix(in oklab, ${accent} 22%, var(--border-hairline))` }}
      >
        {tabs.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
              style={{
                color: active ? t.accent : "var(--text-secondary)",
                fontWeight: active ? 700 : 500,
                borderBottom: `2px solid ${active ? t.accent : "transparent"}`,
                marginBottom: "-1px",
              }}
            >
              {TAB_ICON[t.icon]}
              {t.label}
            </button>
          );
        })}
      </nav>

      {notice && (
        <p className="text-xs" style={{ color: accent }}>
          {notice}
        </p>
      )}

      {children}
    </div>
  );
}
