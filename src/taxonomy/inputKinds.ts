/**
 * A tiny rendering hint for the Log page: which canonical items need
 * something other than a plain tap chip. Code-only and keyed by canonical
 * name — deliberately not part of overrides.json/user_overrides (which is
 * synced per-user to Supabase), since this is purely a UI concern, not
 * data. Add an entry here whenever a new item needs a non-tap input.
 *
 * - "duration": an hours+minutes stepper. Used for Sleep and any other
 *   measured amount grouped under its own category.
 *
 * Symptom intensity (1/2/3) isn't here — it applies to *every* item on the
 * Symptoms tab, so the Log page keys it off the tab type instead.
 */
export const INPUT_KIND: Record<string, "duration"> = {
  "Sleep duration": "duration",
  Sleep: "duration",
};

/** Starting point shown in the DURATION picker before anything's logged
 * for the day — a sensible anchor to nudge from, not a value saved on its
 * own; nothing is written until the picker is actually touched. */
export const DURATION_DEFAULT_MINUTES: Record<string, number> = {
  "Sleep duration": 7 * 60,
  Sleep: 7 * 60,
};
