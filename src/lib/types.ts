import type { ItemType } from "@/taxonomy/categories";

/** A habit/tracked-item definition, as extracted from ZHABIT (dimension data). */
export interface RawHabit {
  /** ZHABIT.ZIDENTITY — stable across exports of the same underlying device DB. */
  identity: string;
  /** Raw, unmodified name from the source (whitespace and all). */
  rawName: string;
  unit: string | null;
  /** 'normal' | 'bad' — direction the app itself assigned to this habit. */
  kind: string | null;
  frequency: string | null;
  isRemoved: boolean;
  /** Epoch-day-derived ISO date the habit was created, if known. */
  createdDate: string | null;
}

/**
 * One row of tracked history for a habit on a given day, as extracted from
 * ZDAILYCOMPLETION (the authoritative, longest-running completion source).
 */
export interface RawEvent {
  /** ZDAILYCOMPLETION.ZIDENTITY — the natural dedupe/merge key. */
  identity: string;
  habitIdentity: string;
  /** Epoch day number (ZFORDAY), converted to an ISO date (UTC). */
  date: string;
  /** Recorded numeric value (count, minutes, steps, etc.) — may be 0. */
  value: number | null;
  goalValue: number | null;
  isSkipped: boolean;
  /** Last-update timestamp (Core Data epoch seconds) used to resolve merge conflicts. */
  updatedAt: number | null;
  /** "Breakfast" | "Lunch" | "Dinner" | "Snack" — set from the Log page's
   * meal selector, independent of when the tap actually happened, so
   * logging breakfast at night still files it as breakfast. Null for
   * imported rows and for anything logged outside the Food tab. */
  mealTag: string | null;
}

/** A free-text note tied to a specific habit + day, from ZDIARY. */
export interface RawDiaryEntry {
  identity: string;
  habitIdentity: string;
  date: string;
  content: string | null;
  title: string | null;
  updatedAt: number | null;
}

/** One row of the canonical, long-format analytical dataset. */
export interface CanonicalEvent {
  /** = the source RawEvent identity; primary key for storage/merge. */
  id: string;
  date: string; // YYYY-MM-DD
  /** Canonical, cleaned display name (e.g. "Eat banana" -> "Eat banana"). */
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
  source: "habit-daily-completion";
  habitIdentity: string;
  note: string | null;
  matchedBy: "override" | "food-keyword" | "fallback";
  updatedAt: number | null;
  mealTag: string | null;
}

export interface ImportFileReport {
  path: string;
  kind: "sqlite" | "plist" | "log" | "zip" | "unknown";
  sizeBytes: number;
  status: "parsed" | "skipped-not-relevant" | "skipped-unrecognized" | "error";
  detail?: string;
}

export interface ImportSummary {
  importedAt: string;
  files: ImportFileReport[];
  habitsFound: number;
  eventsFound: number;
  eventsNew: number;
  eventsUpdated: number;
  eventsUnchanged: number;
  diaryFound: number;
  dateRange: { start: string | null; end: string | null };
  unclassifiedItems: string[];
}
