import type { ReactNode } from "react";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import type { ActivityDomain } from "@/lib/aggregations/activity";

/** Same hand-drawn line-icon style as Nav.tsx's IconWrap and Notes'
 * icons.tsx — kept local rather than imported since neither of those
 * exports its wrapper, and a third copy of a four-line SVG shell isn't
 * worth a shared module. */
function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function FoodIcon() {
  return (
    <IconWrap>
      <path d="M10 8.2A4.8 4.8 0 1 1 10 17.8 4.8 4.8 0 0 1 10 8.2Z" />
      <path d="M10 8.2V5.4" />
      <path d="M10 5.4c0-1 .8-1.8 2-2" />
    </IconWrap>
  );
}
function WorkoutIcon() {
  return (
    <IconWrap>
      <path d="M3 10h2.4M14.6 10H17" />
      <path d="M5.4 7v6M14.6 7v6" />
      <rect x="5.4" y="8.2" width="9.2" height="3.6" rx="0.8" />
    </IconWrap>
  );
}
function SymptomIcon() {
  return (
    <IconWrap>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 6.5v4.2l2.6 1.6" />
    </IconWrap>
  );
}
function CycleIcon() {
  return (
    <IconWrap>
      <path d="M10 3.5c2.9 4.3 5 7.4 5 9.7a5 5 0 0 1-10 0c0-2.3 2.1-5.4 5-9.7Z" />
    </IconWrap>
  );
}
function NotesIcon() {
  return (
    <IconWrap>
      <path d="M3.5 5.8c0-.7.6-1.3 1.3-1.3h10.4c.7 0 1.3.6 1.3 1.3v8.4c0 .7-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.6-1.3-1.3Z" />
      <path d="M4 6.2l6 5 6-5" />
    </IconWrap>
  );
}

export const DOMAIN_ACCENT: Record<ActivityDomain, string> = {
  food: TYPE_ACCENT.food,
  workout: TYPE_ACCENT.workout,
  symptom: TYPE_ACCENT.outcome,
  cycle: "var(--series-4)",
  notes: "var(--series-magenta)",
};

export const DOMAIN_LABEL: Record<ActivityDomain, string> = {
  food: "Food",
  workout: "Workout",
  symptom: "Symptoms",
  cycle: "Cycle",
  notes: "Notes",
};

export const DOMAIN_ICON: Record<ActivityDomain, ReactNode> = {
  food: <FoodIcon />,
  workout: <WorkoutIcon />,
  symptom: <SymptomIcon />,
  cycle: <CycleIcon />,
  notes: <NotesIcon />,
};

export const ALL_DOMAINS: ActivityDomain[] = ["food", "workout", "symptom", "cycle", "notes"];
