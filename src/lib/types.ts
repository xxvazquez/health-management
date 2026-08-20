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
