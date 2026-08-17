/**
 * A tiny rendering hint for the Log page: which canonical items need
 * something other than a plain tap chip. Code-only and keyed by canonical
 * name — deliberately not part of overrides.json/user_overrides (which is
 * synced per-user to Supabase), since this is purely a UI concern, not
 * data. Add an entry here whenever a new item needs a non-tap input.
 */
export const INPUT_KIND: Record<string, "duration"> = {
  "Sleep duration": "duration",
};

/** Starting point shown in the picker before anything's logged for the day
 * — a sensible anchor to nudge from, not a value that gets saved on its
 * own; nothing is written until the picker is actually touched. */
export const DURATION_DEFAULT_MINUTES: Record<string, number> = {
  "Sleep duration": 7 * 60,
};
