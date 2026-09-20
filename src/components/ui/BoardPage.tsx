"use client";

import type { ReactNode } from "react";
import { PageHeading } from "@/components/ui/PageHeading";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

export interface BoardPageTab {
  id: string;
  label: string;
  /** Active-segment tint. Usually one hue for the whole page. */
  accent: string;
}

interface BoardPageProps {
  title: string;
  tabs: BoardPageTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  /** Optional element under the tab bar, e.g. a `<DemoNotice />`. Rendered
   * as-is, so it can bring its own styling. */
  notice?: ReactNode;
  children: ReactNode;
}

/** Shared shell for the Notes page: a large title and a segmented control
 * switching the board below. */
export function BoardPage({ title, tabs, activeTab, onSelectTab, notice, children }: BoardPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeading>{title}</PageHeading>

      <SegmentedTabs
        ariaLabel="Sections"
        items={tabs.map((t) => ({ id: t.id, label: t.label, accent: t.accent }))}
        activeId={activeTab}
        onSelect={onSelectTab}
      />

      {notice}

      {children}
    </div>
  );
}
