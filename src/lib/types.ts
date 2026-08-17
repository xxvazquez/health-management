import type { ItemType } from "@/taxonomy/categories";

export const GYM_EXERCISES = [
  "Squat",
  "Deadlift",
  "Overhead Press",
  "Power Clean",
  "Bench Press",
  "Push Ups",
  "Row Machine",
] as const;
export type GymExercise = (typeof GYM_EXERCISES)[number];

/** One logged lift — an exercise + weight on a given day, from the Gym page. */
export interface RawGymLog {
  id: string;
  date: string; // YYYY-MM-DD
  exercise: GymExercise;
  weightKg: number;
  /** Epoch-millisecond timestamp of when this entry was last created or edited. */
  updatedAt: number;
}

/** A tracked-item definition (a food, symptom, supplement, or habit) —
 * Supabase's `items` table. */
export interface RawItem {
  /** Stable identity, unique per user; the row's primary key alongside user_id. */
  identity: string;
  /** Raw, unmodified name from the source (whitespace and all). */
  rawName: string;
  unit: string | null;
  /** 'normal' | 'bad' — direction the app itself assigned to this item. */
  kind: string | null;
  frequency: string | null;
  isRemoved: boolean;
  /** User-controlled, reversible "I don't do this anymore" — unlike
   * `isRemoved`, an archived item's full history stays in every analysis;
   * only the Log page's tap-candidate pool hides it. Toggled from the
   * Habits/Supplements page, never inferred automatically. */
  isArchived: boolean;
  /** Epoch-day-derived ISO date the item was created, if known. */
  createdDate: string | null;
}

/** One log entry for an item on a given day — Supabase's `logs` table. */
export interface RawLog {
  /** The natural dedupe/merge key. */
  identity: string;
  itemIdentity: string;
  date: string; // YYYY-MM-DD
  /** Recorded numeric value (count, minutes, steps, etc.) — may be 0. */
  value: number | null;
  goalValue: number | null;
  isSkipped: boolean;
  /** Epoch-millisecond timestamp used to resolve merge conflicts. */
  updatedAt: number | null;
  /** "Breakfast" | "Lunch" | "Dinner" | "Snack" — set from the Log page's
   * meal selector, independent of when the tap actually happened, so
   * logging breakfast at night still files it as breakfast. Null for
   * imported rows and for anything logged outside the Food tab. */
  mealTag: string | null;
}

/** A free-text note tied to a specific item + day — Supabase's `diary` table. */
export interface RawDiaryEntry {
  identity: string;
  itemIdentity: string;
  date: string;
  content: string | null;
  title: string | null;
  updatedAt: number | null;
}

/** One row of the canonical, long-format analytical dataset. */
export interface CanonicalEvent {
  /** = the source RawLog identity; primary key for storage/merge. */
  id: string;
  date: string; // YYYY-MM-DD
  /** Canonical, cleaned display name (e.g. "Eat banana" -> "Banana"). */
  item: string;
  /** Original raw name exactly as tracked, preserved for audit/data-quality review. */
  rawItem: string;
  itemType: ItemType;
  category: string;
  subcategory: string;
  value: number | null;
  goalValue: number | null;
  /** value > 0 and not explicitly skipped. */
  completed: boolean;
  isSkipped: boolean;
  unit: string | null;
  /** direction the source app assigned ('normal' | 'bad'), kept as metadata only. */
  kind: string | null;
  /** Whether the source item is currently archived — never affects inclusion
   * here (archived items keep their full history in every analysis), only
   * lets a UI group by active/archived. False for events with no matching item. */
  isArchived: boolean;
  source: "item-log";
  itemIdentity: string;
  note: string | null;
  matchedBy: "override" | "food-keyword" | "fallback";
  updatedAt: number | null;
  mealTag: string | null;
}
