import type { CanonicalEvent, RawDiaryEntry, RawItem, RawLog, RawStoolLog } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";

/** Minimal-but-valid fixture factories for the app's core data shapes, used
 * across the aggregation/canonical test suites. Every field can be
 * overridden; only enough defaults are supplied to make a valid object. */

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makeItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    identity: nextId("item"),
    itemType: "food",
    rawName: "Test Item",
    category: "Misc",
    categoryId: nextId("cat"),
    isArchived: false,
    createdDate: "2026-01-01",
    reminderTime: null,
    unit: null,
    ...overrides,
  };
}

export function makeLog(overrides: Partial<RawLog> = {}): RawLog {
  return {
    identity: nextId("log"),
    itemIdentity: "item-1",
    itemType: "food",
    date: "2026-01-01",
    value: 1,
    updatedAt: "2026-01-01T12:00:00.000Z",
    mealTag: null,
    ...overrides,
  };
}

export function makeDiaryEntry(overrides: Partial<RawDiaryEntry> = {}): RawDiaryEntry {
  return {
    identity: nextId("diary"),
    itemIdentity: "item-1",
    itemType: "food",
    date: "2026-01-01",
    content: "a note",
    title: null,
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: nextId("evt"),
    date: "2026-01-01",
    item: "Test Item",
    itemType: "food" as ItemType,
    category: "Misc",
    value: 1,
    completed: true,
    isArchived: false,
    source: "item-log",
    itemIdentity: "item-1",
    note: null,
    updatedAt: "2026-01-01T12:00:00.000Z",
    mealTag: null,
    ...overrides,
  };
}

export function makeStoolLog(overrides: Partial<RawStoolLog> = {}): RawStoolLog {
  return {
    id: nextId("stool"),
    date: "2026-01-01",
    loggedAt: "2026-01-01T09:00:00.000Z",
    bristolScores: [4],
    noBristol: false,
    color: "Brown",
    floatation: null,
    isSticky: false,
    isSmelly: false,
    isStraining: false,
    hasMucus: false,
    hasUrgency: false,
    hasVisibleFoodParticles: false,
    hasIncompleteEvacuation: false,
    paperCleanliness: "Clean",
    timeOnToiletMinutes: 5,
    note: null,
    updatedAt: "2026-01-01T09:00:00.000Z",
    ...overrides,
  };
}
