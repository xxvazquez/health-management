"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
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

/** One page for every analytics dashboard, switched by a Log-style tab bar
 * (`/analytics#food`) instead of one sidebar entry each. Each tab is gated
 * by the same Manage hide/show toggle its Log tab uses (`isHidden`);
 * Patterns follows Symptoms since it's built on symptom associations. The
 * dashboard components are unchanged — they still render their own `<h1>`
 * and empty states — they just live under `src/components/analytics/` now. */
const TABS: { id: string; label: string; domain: TrackedDomain; accent: string; Component: ComponentType }[] = [
  { id: "food", label: "Food", domain: "food", accent: TYPE_ACCENT.food, Component: FoodDashboard },
  { id: "supplements", label: "Supplements", domain: "supplement", accent: TYPE_ACCENT.supplement, Component: SupplementsDashboard },
  { id: "habits", label: "Habits", domain: "habit", accent: TYPE_ACCENT.habit, Component: HabitsDashboard },
  { id: "digestion", label: "Digestion", domain: "stool", accent: "var(--series-indigo)", Component: DigestionDashboard },
  { id: "workout", label: "Workout", domain: "workout", accent: TYPE_ACCENT.workout, Component: WorkoutDashboard },
  { id: "cycle", label: "Cycle", domain: "cycle", accent: "var(--series-4)", Component: CycleDashboard },
  { id: "patterns", label: "Patterns", domain: "outcome", accent: "var(--series-berry)", Component: PatternsDashboard },
];

export default function AnalyticsPage() {
  const { isHidden } = useVisibleDomains();
  const visibleTabs = useMemo(() => TABS.filter((t) => !isHidden(t.domain)), [isHidden]);

  // Starts at "food" for a match with the statically-rendered HTML, then
  // syncs to the URL hash on mount (and on every back/forward) — reading
  // `location` in the initializer would be a hydration mismatch.
  const [tabId, setTabId] = useState<string>("food");

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
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
      <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Every analytics section is hidden — turn one back on from Manage.
      </p>
    );
  }

  const ActiveDashboard = active.Component;

  return (
    <div className="flex flex-col gap-6">
      <nav
        className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b"
        style={{ borderColor: `color-mix(in oklab, ${active.accent} 22%, var(--border-hairline))` }}
      >
        {visibleTabs.map((t) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className="flex shrink-0 items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
              style={{
                color: isActive ? t.accent : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                borderBottom: `2px solid ${isActive ? t.accent : "transparent"}`,
                marginBottom: "-1px",
              }}
            >
              {TAB_ICON[t.id]}
              {t.label}
            </button>
          );
        })}
      </nav>

      <ActiveDashboard />
    </div>
  );
}
