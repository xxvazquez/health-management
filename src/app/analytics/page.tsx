"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import clsx from "clsx";
import { useVisibleDomains, type TrackedDomain } from "@/lib/visibleDomains";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import { TAB_ICON } from "@/components/tabIcons";
import { FoodDashboard } from "@/components/analytics/FoodDashboard";
import { SupplementsDashboard } from "@/components/analytics/SupplementsDashboard";
import { HabitsDashboard } from "@/components/analytics/HabitsDashboard";
import { DigestionDashboard } from "@/components/analytics/DigestionDashboard";
import { WorkoutDashboard } from "@/components/analytics/WorkoutDashboard";
import { CycleDashboard } from "@/components/analytics/CycleDashboard";
import { PatternsDashboard } from "@/components/analytics/PatternsDashboard";
import { TrendsOverviewDashboard } from "@/components/analytics/TrendsOverviewDashboard";
import { TabRail } from "@/components/ui/TabRail";
import { PageHeading } from "@/components/ui/PageHeading";

/** One page for every analytics dashboard, switched by a Log-style tab bar
 * (`/analytics#food`) instead of one sidebar entry each. Each tab is gated
 * by the same Manage visibility rule its Log tab uses (`isVisible`);
 * Patterns follows Symptoms since it's built on symptom associations. The
 * dashboard components are unchanged — they still render their own `<h1>`
 * and empty states — they just live under `src/components/analytics/` now.
 * The first tab is a cross-domain Overview (today's story + what stands out
 * + a week/month review, moved off Agenda); the rest mirror a Log tracking
 * domain. Blood/lab analysis lives on Health → Results, not here. */
const TABS: { id: string; label: string; domain?: TrackedDomain; accent: string; Component: ComponentType; hasSections?: boolean }[] = [
  { id: "overview", label: "Overview", accent: "var(--text-muted)", Component: TrendsOverviewDashboard },
  { id: "food", label: "Food", domain: "food", accent: TYPE_ACCENT.food, Component: FoodDashboard, hasSections: true },
  { id: "supplements", label: "Supplements", domain: "supplement", accent: TYPE_ACCENT.supplement, Component: SupplementsDashboard },
  { id: "habits", label: "Habits", domain: "habit", accent: TYPE_ACCENT.habit, Component: HabitsDashboard },
  { id: "digestion", label: "Stool", domain: "stool", accent: "var(--series-indigo)", Component: DigestionDashboard },
  { id: "workout", label: "Workout", domain: "workout", accent: TYPE_ACCENT.workout, Component: WorkoutDashboard },
  { id: "cycle", label: "Cycle", domain: "cycle", accent: "var(--series-4)", Component: CycleDashboard },
  { id: "patterns", label: "Patterns", domain: "outcome", accent: "var(--series-berry)", Component: PatternsDashboard },
];

export default function AnalyticsPage() {
  const { isVisible } = useVisibleDomains();
  const visibleTabs = useMemo(() => TABS.filter((t) => !t.domain || isVisible(t.domain)), [isVisible]);

  // Starts at "overview" for a match with the statically-rendered HTML,
  // then syncs to the URL hash on mount (and on every back/forward) —
  // reading `location` in the initializer would be a hydration mismatch.
  const [tabId, setTabId] = useState<string>("overview");

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      // Blood analysis moved to Health → Results.
      if (id === "labs") {
        window.location.replace("/medical/#results");
        return;
      }
      if (TABS.some((t) => t.id === id)) setTabId(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTab(id: string) {
    setTabId(id);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${id}`);
  }

  const active = visibleTabs.find((t) => t.id === tabId) ?? visibleTabs[0];

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeading>Trends</PageHeading>
        <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Every section is hidden — turn one back on from Settings.
        </p>
      </div>
    );
  }

  const ActiveDashboard = active.Component;

  return (
    <div className="flex flex-col gap-6">
      {/* Stable neutral rule on the page heading — the per-domain colour
          lives on the tab rail and the charts (the Log↔Trends mirror),
          not on the page chrome, which shouldn't flip through eight hues
          as you switch tabs. */}
      <PageHeading>Trends</PageHeading>

      {/* Sticky on mobile for the plain single-scroll dashboards, so the
          domain switcher stays reachable. On Food it isn't — Food's own
          section tabs take the sticky slot there instead (two stacked
          sticky bars would eat half a phone screen). Always sticky on `lg`. */}
      <TabRail
        items={visibleTabs.map((t) => ({ id: t.id, label: t.label, icon: TAB_ICON[t.id], accent: t.accent }))}
        activeId={active.id}
        onSelect={selectTab}
        wrap={false}
        className={clsx(
          "-mx-4 border-b border-[color:var(--border-hairline)] bg-[var(--page-backdrop)] px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-0 lg:z-20 lg:-mx-8 lg:px-8",
          !active.hasSections && "sticky top-16 z-20",
        )}
      />

      <ActiveDashboard />
    </div>
  );
}
