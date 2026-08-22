import type { ItemType } from "@/taxonomy/categories";

/** Seeded as real `workout_items` rows (see categoryResolution.ts's
 * `ensureDefaultWorkoutItems`) the first time a signed-in user with none
 * yet opens the Workout tab — preserves the exact 7 exercises this app
 * used to hardcode, now just as a starting point rather than the whole
 * list. Exercise names are otherwise fully user-defined from here on
 * (Running, Swimming, Yoga, ... — see the Workout section of Manage). */
export const WORKOUT_EXERCISES = [
  "Squat",
  "Deadlift",
  "Overhead Press",
  "Power Clean",
  "Bench Press",
  "Push Ups",
  "Row Machine",
] as const;
export type WorkoutExercise = string;

/** What a `RawWorkoutLog.weightKg` value actually means for a given exercise —
 * kg for strength work, but a yoga/cardio session is more naturally tracked
 * in minutes, and a bodyweight exercise in reps. Configured per exercise on
 * its `workout_items` row (see `RawItem.unit`), defaulting to "kg" (every
 * exercise before units existed was strength work). Free text, not a fixed
 * set — the Manage page lets a unit be added/edited/deleted like anything
 * else, so `WORKOUT_UNITS` below is only the built-in starting suggestions
 * (with a tuned stepper — see NumberStepper's `UNIT_STEP_PRESETS`), never
 * an exhaustive list. */
export const WORKOUT_UNITS = ["kg", "minutes", "reps"] as const;
export type WorkoutUnit = string;

const KNOWN_WORKOUT_UNIT_LABEL: Record<string, string> = {
  kg: "kg",
  minutes: "min",
  reps: "reps",
};

/** Short display label for a unit — the 3 built-in units abbreviate
 * (minutes -> min); anything a user typed in for a custom unit is shown
 * exactly as they typed it, since there's no abbreviation to guess. */
export function workoutUnitLabel(unit: string): string {
  return KNOWN_WORKOUT_UNIT_LABEL[unit] ?? unit;
}

/** One logged set — an exercise + a numeric value (see `WorkoutUnit` for
 * what it means) on a given day, from the Log page's Workout tab.
 * `exercise` is a plain display name locally, resolved to/from
 * `workout_items.id` only at the Supabase sync boundary (`buildWorkoutLogRow`/
 * `pullFromCloud` in `sync.ts`) — `workout_logs.item_id` is a real foreign
 * key there, same as every other log table, but the in-app shape stays a name
 * to avoid touching the aggregation/UI code that reads it. `weightKg` keeps
 * its original name/column even though it now holds whatever unit the
 * exercise is configured for (minutes, reps) — renaming the column would
 * be a second migration on live data for a cosmetic gain only; every read
 * site pairs it with the resolved unit label rather than assuming kg. */
export interface RawWorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  exercise: WorkoutExercise;
  weightKg: number;
  /** Epoch-millisecond timestamp of when this entry was last created or edited. */
  updatedAt: number;
}

export const PERIOD_INTENSITIES = ["Light", "Medium", "Heavy", "Super Heavy"] as const;
export type PeriodIntensity = (typeof PERIOD_INTENSITIES)[number];

/** The app's four suggested collection methods — shown as chips in the
 * Cycle Tracker's editor. `RawPeriodLog.collectionMethods` isn't
 * constrained to these (see its own comment): this is a UI suggestion
 * list, not the full domain, same relationship WORKOUT_UNITS has to
 * `workout_items.unit`. */
export const COLLECTION_METHODS = ["Tampon", "Pad", "Panty Liner", "Period Underwear"] as const;
export type CollectionMethod = string;

/**
 * One calendar day flagged as a period day — Supabase's `period_logs`
 * table. Standalone, like `RawStoolLog`: no item/category of its own, at
 * most one row per date (enforced by a unique constraint), and a day's
 * presence in the table is itself what "on your period" means — there's
 * no separate boolean. Period length, cycle length, cycle day, and
 * predictions are all derived from a list of these at the app layer (see
 * `src/lib/aggregations/cycle.ts`), never stored.
 */
export interface RawPeriodLog {
  id: string;
  date: string; // YYYY-MM-DD
  intensity: PeriodIntensity;
  /** Free text, not a fixed set — see COLLECTION_METHODS' own comment. */
  collectionMethods: CollectionMethod[];
  /** Epoch-millisecond timestamp of when this entry was last created or edited. */
  updatedAt: number;
}

/**
 * A tracked-item definition (a food, symptom, supplement, or habit) — one
 * unified shape in app code even though Supabase stores each type in its
 * own table (`food_items`/`supplement_items`/`habit_items`/`symptom_items`).
 * `category`/`categoryId` are always already resolved — the `category_id`
 * FK (same shape for all four types now) is resolved to a name at read
 * time — nothing in the app re-derives a category from the item's name.
 */
export interface RawItem {
  /** Stable identity, unique per user; the row's primary key (`id` in Supabase). */
  identity: string;
  itemType: ItemType;
  /** Display name — what the item actually is, no separate "raw vs
   * canonical" distinction now that classification isn't name-matched. */
  rawName: string;
  category: string;
  /** The `categories` table row this item points at. */
  categoryId: string | null;
  /** User-controlled, reversible "I don't do this anymore" — an archived
   * item's full history stays in every analysis; only the Log page's
   * tap-candidate pool hides it. Toggled from the Manage/Habits page, never
   * inferred automatically. There's no "removed" state anymore — the
   * composite FKs from logs/diary to items make items undeletable while
   * they have history, so archiving is the only retirement path. */
  isArchived: boolean;
  /** ISO date the item was created, if known. */
  createdDate: string | null;
  /** Local wall-clock "HH:MM" for a daily reminder push, supplement/habit
   * items only; null means no reminder. Set from the Manage page. The
   * server also tracks a `reminder_last_sent_date` dedupe stamp, but that's
   * cron-only bookkeeping this type deliberately never carries — see
   * setItemReminderTimeAndSync in lib/supabase/sync.ts for why. */
  reminderTime: string | null;
  /** Workout items only — what a logged value for this exercise means (kg,
   * minutes, reps). Null for every other type, and for a workout item
   * that predates units (treated as "kg" wherever it's read — see
   * WORKOUT_UNITS' own comment). */
  unit: WorkoutUnit | null;
}

/** One log entry for an item on a given day — Supabase's `<type>_logs` tables. */
export interface RawLog {
  /** The natural dedupe/merge key. */
  identity: string;
  itemIdentity: string;
  itemType: ItemType;
  date: string; // YYYY-MM-DD
  /** Recorded numeric value (count, minutes, etc.) — may be 0. */
  value: number | null;
  /** ISO timestamp used to resolve merge conflicts / order same-day entries. */
  updatedAt: string | null;
  /** "Breakfast" | "Lunch" | "Dinner" | "Snack" — set from the Log page's
   * meal selector, independent of when the tap actually happened, so
   * logging breakfast at night still files it as breakfast. Food only. */
  mealTag: string | null;
}

/** A user-defined category — Supabase's `categories` table, shared across
 * all four item types (food, supplement, habit, outcome). */
export interface RawCategory {
  id: string;
  itemType: ItemType;
  name: string;
}

/** A free-text note tied to a specific item + day — Supabase's `<type>_diary` tables. */
export interface RawDiaryEntry {
  identity: string;
  itemIdentity: string;
  itemType: ItemType;
  date: string;
  content: string | null;
  title: string | null;
  updatedAt: string | null;
}

export const STOOL_COLORS = ["Brown", "Dark Brown", "Green", "Light Brown", "Yellow"] as const;
export type StoolColor = (typeof STOOL_COLORS)[number];

export const PAPER_CLEANLINESS_OPTIONS = ["Clean", "Slightly Dirty", "Dirty", "Very Dirty"] as const;
export type PaperCleanliness = (typeof PAPER_CLEANLINESS_OPTIONS)[number];

export const STOOL_FLOATATION_OPTIONS = ["Floats", "Partially Floats"] as const;
export type StoolFloatation = (typeof STOOL_FLOATATION_OPTIONS)[number];

/**
 * One bowel movement — Supabase's `stool_logs` table. Its own first-class
 * log type, not an "outcome" item with a subcategory hack: no name, no
 * category, no archive state, and (unlike the other four types) more than
 * one entry per day is normal, ordered by `loggedAt`.
 */
export interface RawStoolLog {
  id: string;
  date: string;
  loggedAt: string;
  /** One or more of 1–7 — a single bowel movement can include more than one
   * consistency (e.g. both a Type 1 and a Type 3 piece), so this is never
   * collapsed to a single value. Empty exactly when `noBristol` is true. */
  bristolScores: number[];
  /** A bowel movement happened but the type wasn't observed/classifiable —
   * still counts as "assessed that day", just excluded from numeric charts. */
  noBristol: boolean;
  color: StoolColor | null;
  /** Unset (null) means neither observed — a normal sinking stool isn't
   * itself trackable, only the two notable states are. */
  floatation: StoolFloatation | null;
  isSticky: boolean;
  isSmelly: boolean;
  isStraining: boolean;
  hasMucus: boolean;
  hasUrgency: boolean;
  hasVisibleFoodParticles: boolean;
  hasIncompleteEvacuation: boolean;
  paperCleanliness: PaperCleanliness | null;
  timeOnToiletMinutes: number | null;
  note: string | null;
  updatedAt: string | null;
}

/** One row of the canonical, long-format analytical dataset. */
export interface CanonicalEvent {
  /** = the source RawLog identity; primary key for storage/merge. */
  id: string;
  date: string; // YYYY-MM-DD
  item: string;
  itemType: ItemType;
  category: string;
  value: number | null;
  /** value > 0. */
  completed: boolean;
  /** Whether the source item is currently archived — never affects inclusion
   * here (archived items keep their full history in every analysis), only
   * lets a UI group by active/archived. */
  isArchived: boolean;
  source: "item-log";
  itemIdentity: string;
  note: string | null;
  updatedAt: string | null;
  mealTag: string | null;
}
