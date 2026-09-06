import { TYPE_ACCENT } from "@/taxonomy/categories";

/** The domains the day-snapshot timeline colours its rows by. */
export type ActivityDomain = "food" | "workout" | "symptom" | "cycle" | "notes";

export const DOMAIN_ACCENT: Record<ActivityDomain, string> = {
  food: TYPE_ACCENT.food,
  workout: TYPE_ACCENT.workout,
  symptom: TYPE_ACCENT.outcome,
  cycle: "var(--series-4)",
  notes: "var(--series-magenta)",
};
