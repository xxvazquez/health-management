"use client";

import type { ReactNode } from "react";
import { TAB_ICON } from "@/components/tabIcons";
import { TabRail } from "@/components/ui/TabRail";

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
 * coloured left rule, an underlined tab bar that wraps to a second row on
 * narrow screens rather than scrolling sideways (so no tab is ever hidden
 * off-edge), and the active board below. Keeps the two pages structurally
 * identical — only the tab set, colours, and board content differ. */
export function BoardPage({ title, accent, tabs, activeTab, onSelectTab, notice, children }: BoardPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-l-[3px] pl-2.5" style={{ borderColor: accent }}>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
      </div>

      <TabRail
        items={tabs.map((t) => ({ id: t.id, label: t.label, icon: TAB_ICON[t.icon], accent: t.accent }))}
        activeId={activeTab}
        onSelect={onSelectTab}
      />

      {notice && (
        <p className="text-xs" style={{ color: accent }}>
          {notice}
        </p>
      )}

      {children}
    </div>
  );
}
