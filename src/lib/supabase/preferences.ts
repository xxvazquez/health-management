import { supabase } from "./client";
import { upsertDirect } from "./directWrite";
import type { FoodTargetsPref } from "@/lib/foodTargets";
import type { ItemSchedule } from "@/lib/aggregations/schedule";

const TABLE = "user_preferences";

/** Account-wide preferences, shared by every device — list orders, which
 * sections show, the default time for new dates, the appearance. One row per user, one
 * JSON object. */
export interface Preferences {
  /** Custom order per list, as ordered keys (ids or names). */
  orders?: Record<string, string[]>;
  /** Explicit show/hide per tracked section (see visibleDomains.tsx). */
  domainVisibility?: Record<string, boolean>;
  /** "HH:MM" a new date picks up before a time is chosen; unset = next hour. */
  defaultTime?: string | null;
  /** Settings → Appearance: light/dark/system and each mode's palette. */
  appearance?: { theme?: string; light?: string; dark?: string };
  /** The Log section last open, so Log reopens there. */
  lastLogTab?: string;
  /** Settings → Food targets: diet plus per-group weekly targets. */
  foodTargets?: FoodTargetsPref;
  /** Health → Results: show panel and marker names in Polish or English. */
  labNameLanguage?: "pl" | "en";
  /** Settings → Usual times: "HH:MM" per meal / supplement time of day,
   * for entries logged after the fact. Unset slots use DEFAULT_SLOT_TIMES. */
  slotTimes?: Record<string, string>;
  /** Settings → a supplement's or habit's Schedule, keyed by item id.
   * Absent = every day. Trends measures adherence against it. */
  itemSchedules?: Record<string, ItemSchedule>;
  /** Trends → Patterns links marked "Not related", never shown again. */
  hiddenPatternLinks?: HiddenPatternLink[];
  /** Log → In season picks marked "don't show", as normalized names. */
  hiddenSeasonalPicks?: string[];
}

export interface HiddenPatternLink {
  symptom: string;
  trigger: string;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchPreferences(): Promise<Preferences> {
  if (!supabase) return {};
  const myUserId = await currentUserId();
  if (!myUserId) return {};
  const { data, error } = await supabase.from(TABLE).select("prefs").eq("user_id", myUserId).maybeSingle();
  if (error) throw error;
  const prefs: unknown = data?.prefs;
  return prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Preferences) : {};
}

/** Replaces the whole preferences object. Offline it queues; see
 * directWrite.ts. */
export async function savePreferences(prefs: Preferences): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, TABLE, myUserId, { user_id: myUserId, prefs, updated_at: new Date().toISOString() });
}
