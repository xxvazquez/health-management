"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  setDiaryNoteAndSync,
  incrementDailyLogAndSync,
  deleteLogByIdAndSync,
  putItemAndSync,
  putStoolLogAndSync,
  deleteStoolLogByIdAndSync,
  setDailyDurationAndSync,
  toggleDailyLogAndSync,
  updateLogMealTagAndSync,
  updateLogTimeAndSync,
  updateStoolLogTimeAndSync,
  decrementDailyLogAndSync,
  decrementDailyLogForMealAndSync,
} from "@/lib/supabase/sync";
import { getAllDiary, getAllItems, getAllLogs, getAllCategories, getAllStoolLogs } from "@/lib/db/indexedDb";
import {
  buildLogCandidates,
  dayTimelineEntries,
  loggedCountsForDate,
  type LogCandidate,
  type TimelineEntry,
} from "@/lib/logCandidates";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import { ensureCategoryId } from "@/lib/categoryResolution";
import { seasonalPicksForMonth, weeklyCategoryPriority } from "@/lib/aggregations/seasonal";
import { formatMinutes, todayLocalISODate } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import { normalizeName, titleCaseFallback } from "@/taxonomy/normalizeName";
import { TYPE_ACCENT, colorForCategorySlot, effectiveCategoryList, type ItemType } from "@/taxonomy/categories";
import { lookupFoodCategory } from "@/taxonomy/classify";
import { POLAND_FOOD_CATALOG } from "@/taxonomy/polandFoodCatalog";
import { DURATION_DEFAULT_MINUTES, INPUT_KIND } from "@/taxonomy/inputKinds";
import { DurationStepper } from "@/components/ui/DurationStepper";
import { BreakfastReminderToggle } from "@/components/BreakfastReminderToggle";
import { StoolTab, type NewStoolEntry } from "@/components/log/StoolTab";
import { DuplicateItemDialog } from "@/components/ui/DuplicateItemDialog";
import type { RawLog, RawItem, RawDiaryEntry, RawCategory, RawStoolLog } from "@/lib/types";

const TABS: { type: ItemType; label: string; placeholder: string; defaultCategory: string; countable: boolean }[] = [
  { type: "food", label: "Food", placeholder: "Add a food or ingredient…", defaultCategory: "Misc", countable: true },
  { type: "outcome", label: "Symptoms", placeholder: "Add a symptom…", defaultCategory: "Other Symptom", countable: false },
  { type: "supplement", label: "Supplements", placeholder: "Add a supplement…", defaultCategory: "Other", countable: false },
  { type: "habit", label: "Habits", placeholder: "Add a habit…", defaultCategory: "Other", countable: false },
];

type LogTab = ItemType | "stool";
const STOOL_ACCENT = "var(--series-chestnut)";

const MEAL_OPTIONS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

/** Guesses which meal is being logged from the current time of day, so the
 * selector starts on something plausible instead of always "Breakfast" —
 * still just a starting point, never locked in. */
function defaultMealForTime(now: Date = new Date()): (typeof MEAL_OPTIONS)[number] {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 6 * 60 && minutes < 12 * 60) return "Breakfast";
  if (minutes >= 12 * 60 && minutes < 15 * 60) return "Lunch";
  if (minutes >= 15 * 60 && minutes < 23 * 60 + 30) return "Dinner";
  return "Snack";
}

/** Combines the currently-viewed day with a local "HH:MM" into a full ISO
 * timestamp — the shape every log's `updatedAt`/`loggedAt` is stored as. */
function combineDateAndTime(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function CategoryIconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Food-category icons — same thin-stroke line-art language as Nav.tsx's
 * nav icons, not emoji, so the highest-frequency tab (tapped many times a
 * day) stays scannable without looking like a stock emoji picker. Only food
 * gets these: it's the tab with both the most categories and the most
 * repeat taps, per the redesign this was built for. */
const FOOD_CATEGORY_ICON: Record<string, ReactNode> = {
  Veggies: (
    <CategoryIconWrap>
      <path d="M6 14C6 8 10 4 16 4c0 6-4 10-10 10Z" />
      <path d="M6 14 12 8" />
    </CategoryIconWrap>
  ),
  Fruit: (
    <CategoryIconWrap>
      <circle cx="10" cy="12" r="5.5" />
      <path d="M10 6.5V4.5" />
      <path d="M10 4.5c0-.9.6-1.5 1.6-1.8" />
    </CategoryIconWrap>
  ),
  Legumes: (
    <CategoryIconWrap>
      <path d="M5 12c0-4 2-7 6-7s6 3 6 7-2 5-6 5-6-1-6-5Z" />
      <circle cx="8" cy="11" r=".6" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="10.3" r=".6" fill="currentColor" stroke="none" />
      <circle cx="13" cy="11" r=".6" fill="currentColor" stroke="none" />
    </CategoryIconWrap>
  ),
  Grains: (
    <CategoryIconWrap>
      <path d="M10 17V6" />
      <path d="M10 8 7.5 6.5M10 8l2.5-1.5M10 10.5 7.5 9M10 10.5l2.5-1.5M10 13l-2.5-1.5M10 13l2.5-1.5" />
    </CategoryIconWrap>
  ),
  Dairy: (
    <CategoryIconWrap>
      <path d="M7.5 5h5l.5 3v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8l.5-3Z" />
      <path d="M7.3 9h5.4" />
    </CategoryIconWrap>
  ),
  "Dairy Alternatives": (
    <CategoryIconWrap>
      <path d="M7.5 5h5l.5 3v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8l.5-3Z" />
      <path d="M9.5 4.5c0-1 .8-1.8 2-2" />
    </CategoryIconWrap>
  ),
  Meat: (
    <CategoryIconWrap>
      <path d="M5.5 8a3 3 0 0 1 3-3h4a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-4a3 3 0 0 1-3-3V8Z" />
      <path d="M7.5 9c.8.8 1.7.8 2.5 0M8.5 12c.8.8 1.7.8 2.5 0" />
    </CategoryIconWrap>
  ),
  Fish: (
    <CategoryIconWrap>
      <path d="M4 11c1.5-2.5 4-4 7-4s5 1.5 5 4-2.5 4-5 4-5.5-1.5-7-4Z" />
      <path d="M16 11l2.5-2.2v4.4L16 11Z" />
      <circle cx="8" cy="10" r=".6" fill="currentColor" stroke="none" />
    </CategoryIconWrap>
  ),
  "Nuts & Seeds": (
    <CategoryIconWrap>
      <path d="M7 10.3c0-2.5 1.5-4 3-4s3 1.5 3 4-1.5 4.7-3 4.7-3-2.2-3-4.7Z" />
      <path d="M7.3 9.3h5.4" />
      <path d="M8.5 6.3c0-1 .7-1.6 1.5-1.6s1.5.6 1.5 1.6" />
    </CategoryIconWrap>
  ),
  Fats: (
    <CategoryIconWrap>
      <path d="M10 4c2 3.2 4 6 4 8.5a4 4 0 0 1-8 0C6 10 8 7.2 10 4Z" />
    </CategoryIconWrap>
  ),
  Misc: (
    <CategoryIconWrap>
      <path d="M8.5 4h3v2.2c1 .3 1.5 1 1.5 2v6.8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8.2c0-1 .5-1.7 1.5-2V4Z" />
      <path d="M7.5 10h5" />
    </CategoryIconWrap>
  ),
};

function addDaysLocal(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDaysLocal(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Optional note for one timeline entry's item+day — collapsed to a small
 * "+ note" affordance when empty, never a required field or a diary form. */
function TimelineNote({
  note,
  busy,
  hidden,
  onSave,
}: {
  note: string | null;
  busy: boolean;
  hidden: boolean;
  onSave: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");

  if (hidden) {
    return note ? (
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {note}
      </p>
    ) : null;
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          onSave(text);
        }}
        className="flex items-center gap-1"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="Add a note…"
          className="w-32 rounded-md border px-1.5 py-0.5 text-xs outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button type="submit" className="text-xs font-medium" style={{ color: "var(--status-good)" }}>
          Save
        </button>
      </form>
    );
  }

  return note ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={busy}
      className="text-left text-xs disabled:opacity-40"
      style={{ color: "var(--text-secondary)" }}
    >
      {note}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={busy}
      className="self-start text-xs underline decoration-dotted disabled:opacity-40"
      style={{ color: "var(--text-muted)" }}
    >
      + note
    </button>
  );
}

interface Snapshot {
  items: RawItem[];
  logs: RawLog[];
  diary: RawDiaryEntry[];
  categories: RawCategory[];
  stoolLogs: RawStoolLog[];
}

export default function LogPage() {
  const { refresh, isDemoData, status } = useData();
  const { openPanel } = useAuth();
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<LogTab>("food");
  const [addingNew, setAddingNew] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState("");
  const [duplicateConflict, setDuplicateConflict] = useState<RawItem | null>(null);
  const [picksOpen, setPicksOpen] = useState(false);
  const [meal, setMeal] = useState<(typeof MEAL_OPTIONS)[number]>(defaultMealForTime);
  const [newItemText, setNewItemText] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set(["Meat"]));

  const loadSnapshot = useCallback(async () => {
    const [items, logs, diary, categories, stoolLogs] = await Promise.all([
      getAllItems(),
      getAllLogs(),
      getAllDiary(),
      getAllCategories(),
      getAllStoolLogs(),
    ]);
    setSnapshot({ items, logs, diary, categories, stoolLogs });
  }, []);

  useEffect(() => {
    // Re-reads local IndexedDB whenever the shared data status changes —
    // covers both the initial mount and the global sign-in pull-from-cloud
    // (DataContext) landing, without this page issuing its own Supabase
    // fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSnapshot();
  }, [status, loadSnapshot]);

  // Signed out with nothing logged locally yet — show the same static demo
  // dataset the rest of the app uses (see DataContext), so the Log page
  // looks and reads exactly like a real day instead of an empty shell.
  // Every write handler below no-ops while this is true; the only way to
  // actually log something is to sign in or log something for real first.
  const demo = useMemo(() => (isDemoData ? buildDemoDataset() : null), [isDemoData]);
  const dataReady = demo !== null || snapshot !== null;
  const effective = useMemo<Snapshot>(
    () =>
      demo
        ? { items: demo.items, logs: demo.logs, diary: [], categories: [], stoolLogs: demo.stoolLogs }
        : (snapshot ?? { items: [], logs: [], diary: [], categories: [], stoolLogs: [] }),
    [demo, snapshot],
  );

  const candidates = useMemo(() => buildLogCandidates(effective.items, effective.logs), [effective]);

  const counts = useMemo(() => loggedCountsForDate(effective.logs, date), [effective, date]);

  const tabConfig = TABS.find((t) => t.type === tab);

  // For the Food tab specifically, a chip's checkmark reflects whether it
  // was logged for the *currently selected meal*, not the whole day — so
  // switching from Breakfast to Lunch shows everything unticked again and
  // milk can be logged separately for breakfast, lunch, and dinner instead
  // of one tap toggling a single day-wide entry.
  const mealCounts = useMemo(
    () => (tabConfig?.countable ? loggedCountsForDate(effective.logs, date, meal) : counts),
    [effective, date, meal, tabConfig?.countable, counts],
  );

  // For duration-kind items (currently just Sleep duration): the actual
  // logged value for the day, keyed by item identity — a plain tap count
  // doesn't mean anything for these, only the value does.
  const durationValueForDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of effective.logs) {
      if (l.date !== date || l.value == null) continue;
      map.set(l.itemIdentity, l.value);
    }
    return map;
  }, [effective, date]);

  const tabCandidates = useMemo(() => candidates.filter((c) => c.itemType === tab), [candidates, tab]);

  const stoolEntriesForDate = useMemo(
    () =>
      effective.stoolLogs
        .filter((s) => s.date === date)
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    [effective, date],
  );

  const trimmedNewItemText = newItemText.trim();

  // Grouped in the taxonomy's fixed category order (not by frequency), so a
  // category always sits in the same place and the alphabetical list inside
  // it never reshuffles — the whole point is finding a specific item by eye
  // without typing. For Food specifically, also folds in the Poland catalog
  // (src/taxonomy/polandFoodCatalog.ts) so browsing isn't limited to what's
  // already been tracked — a catalog-only entry gets itemIdentity "" as a
  // sentinel: nothing exists in the db for it yet, so tapping it creates the
  // item first (see handleChipTap / handleQuickLogCatalog) rather than
  // incrementing a real log row.
  // The real, user-editable category list for this tab — from the
  // `categories` table, falling back to the built-in defaults only as a
  // bootstrap seed (see `effectiveCategoryList`'s own doc comment). Never
  // re-merges those defaults once real rows exist.
  const categoryNamesForTab = useMemo(() => {
    if (!tabConfig) return [];
    const custom = effective.categories.filter((c) => c.itemType === tabConfig.type).map((c) => c.name);
    return effectiveCategoryList(tabConfig.type, custom);
  }, [effective.categories, tabConfig]);

  // Same as categoryNamesForTab, but always food's list regardless of the
  // active tab — the seasonal-picks and Poland-catalog quick-log flows are
  // food-only surfaces that stay visible even when a different tab is open.
  const foodCategoryNames = useMemo(() => {
    const custom = effective.categories.filter((c) => c.itemType === "food").map((c) => c.name);
    return effectiveCategoryList("food", custom);
  }, [effective.categories]);

  // Food can often guess its own category from the name; every other type
  // has no classifier to guess from, so it always asks.
  const newItemNeedsCategory = useMemo(() => {
    if (!trimmedNewItemText || !tabConfig) return false;
    if (tabConfig.type === "food") return !lookupFoodCategory(trimmedNewItemText, categoryNamesForTab);
    return true;
  }, [trimmedNewItemText, tabConfig, categoryNamesForTab]);

  const groupedByCategory = useMemo(() => {
    if (!tabConfig) return [];
    const byCategory = new Map<string, LogCandidate[]>();
    for (const c of tabCandidates) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }
    if (tab === "food") {
      // Every food item, active or archived — an archived item (including
      // one archived straight from a catalog suggestion, never tapped
      // before) must not have its name resurrected as a catalog chip.
      const known = new Set(effective.items.filter((i) => i.itemType === "food").map((i) => normalizeName(i.rawName)));
      for (const [category, names] of Object.entries(POLAND_FOOD_CATALOG)) {
        for (const name of names) {
          const norm = normalizeName(name);
          if (known.has(norm)) continue;
          known.add(norm);
          const list = byCategory.get(category) ?? [];
          list.push({ key: `catalog|${category}|${name}`, item: name, itemType: "food", category, itemIdentity: "", count: 0 });
          byCategory.set(category, list);
        }
      }
    }
    for (const list of byCategory.values()) list.sort((a, b) => a.item.localeCompare(b.item));
    // The real category list, unioned with whatever category names actually
    // showed up on a candidate/catalog entry — never drops a real item's
    // category just because it isn't in the "official" list.
    const allCategoryNames = new Set([...categoryNamesForTab, ...byCategory.keys()]);
    return Array.from(allCategoryNames)
      .map((category) => ({ category, items: byCategory.get(category) ?? [] }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [tabCandidates, tab, tabConfig, categoryNamesForTab, effective.items]);

  const loggedTodayCount = useMemo(
    () => candidates.filter((c) => (counts.get(c.key) ?? 0) > 0).length,
    [candidates, counts],
  );

  const dayTimeline = useMemo(
    () => dayTimelineEntries(effective.items, effective.logs, effective.diary, date),
    [effective, date],
  );

  // Stool has no item/category of its own, but still belongs in the same
  // day timeline as food/supplements/habits/symptoms — mapped into the
  // same shape and merged in, sorted back together by the instant each one
  // actually happened rather than kept as a second, separate list.
  const combinedTimeline = useMemo(() => {
    const stoolAsTimeline: TimelineEntry[] = stoolEntriesForDate.map((s) => ({
      key: s.id,
      item: s.bristolScores.length > 0 ? `Bristol ${s.bristolScores.join(", ")}` : "No Bristol",
      itemType: "stool",
      itemIdentity: s.id,
      time: new Date(s.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      updatedAt: s.loggedAt,
      mealTag: null,
      value: null,
      note: null,
    }));
    return [...dayTimeline, ...stoolAsTimeline].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [dayTimeline, stoolEntriesForDate]);

  // Unfiltered canonical events (no archived-item or date-range filtering,
  // unlike the dashboards' DataContext) so "weeks since last eaten" stays
  // accurate even for something that went quiet long enough to be archived
  // from the regular dashboards.
  const seasonalCanonical = useMemo(() => buildCanonicalEvents(effective.items, effective.logs, []), [effective]);

  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const monthName = useMemo(
    () => new Date(2000, currentMonth - 1, 1).toLocaleDateString(undefined, { month: "long" }),
    [currentMonth],
  );
  const seasonalPicks = useMemo(
    () => seasonalPicksForMonth(seasonalCanonical, currentMonth, today),
    [seasonalCanonical, currentMonth, today],
  );
  // Ranked by neglect for the underlying priority logic, but shown A–Z —
  // scanning a long chip row is easier alphabetically than by a number
  // most people won't stop to read anyway.
  const seasonalPicksSorted = useMemo(
    () => [...seasonalPicks].sort((a, b) => a.item.localeCompare(b.item)),
    [seasonalPicks],
  );
  const weeklyPriority = useMemo(
    () => weeklyCategoryPriority(seasonalCanonical, today),
    [seasonalCanonical, today],
  );
  const leastTrackedCategory = weeklyPriority[0] ?? null;

  async function refreshAfterWrite() {
    await loadSnapshot();
    await refresh();
  }

  async function handleIncrement(candidate: LogCandidate) {
    if (isDemoData) return;
    setPending(candidate.key);
    await incrementDailyLogAndSync(candidate.itemIdentity, candidate.itemType, date, tabConfig?.countable ? meal : null);
    await refreshAfterWrite();
    setPending(null);
  }

  async function handleDecrement(candidate: LogCandidate) {
    if (isDemoData) return;
    setPending(candidate.key);
    if (tabConfig?.countable) {
      await decrementDailyLogForMealAndSync(candidate.itemIdentity, date, meal);
    } else {
      await decrementDailyLogAndSync(candidate.itemIdentity, date);
    }
    await refreshAfterWrite();
    setPending(null);
  }

  async function handleToggle(candidate: LogCandidate) {
    if (isDemoData) return;
    setPending(candidate.key);
    await toggleDailyLogAndSync(candidate.itemIdentity, candidate.itemType, date);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Sets (or overwrites) a duration-kind item's value for the day — one
   * log per item per day, upserted by reusing whatever row already exists,
   * unlike the increment/toggle flows above which add or remove whole rows.
   * The raw minutes are always what's stored; nothing here ever reduces it
   * to a boolean or a bucket — that only happens later, read-only, in
   * analysis. */
  async function handleSetDuration(candidate: LogCandidate, totalMinutes: number) {
    if (isDemoData) return;
    setPending(candidate.key);
    await setDailyDurationAndSync(candidate.itemIdentity, candidate.itemType, date, totalMinutes);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Undoes a specific mistaken tap from the day's timeline — deletes that
   * exact entry, locally and (once synced) in Supabase too. Stool entries
   * share this same timeline but live in their own table, so this branches
   * on `itemType` rather than assuming every entry is a `RawLog` row. */
  async function handleDeleteEntry(entry: TimelineEntry) {
    if (isDemoData) return;
    setPending(entry.key);
    if (entry.itemType === "stool") {
      await deleteStoolLogByIdAndSync(entry.key);
      await refreshAfterWrite();
      setPending(null);
      return;
    }
    await deleteLogByIdAndSync(entry.key, entry.itemType);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Corrects the meal tag on an already-logged entry, e.g. something typed
   * as Lunch that was actually Dinner. Food only — the timeline only ever
   * offers this control for food entries. */
  async function handleChangeEntryMeal(entry: TimelineEntry, mealTag: string) {
    if (isDemoData || entry.itemType === "stool") return;
    setPending(entry.key);
    await updateLogMealTagAndSync(entry.key, mealTag);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Corrects when an entry actually happened — available everywhere in the
   * timeline, food/supplement/habit/symptom and Stool alike. */
  async function handleChangeEntryTime(entry: TimelineEntry, time: string) {
    if (isDemoData) return;
    const iso = combineDateAndTime(date, time);
    setPending(entry.key);
    if (entry.itemType === "stool") {
      await updateStoolLogTimeAndSync(entry.key, iso);
      await refreshAfterWrite();
      setPending(null);
      return;
    }
    await updateLogTimeAndSync(entry.key, iso);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Optional context for one item on one day — structured data first, this
   * is just a short note attached to it, never a required field. */
  async function handleSaveNote(entry: TimelineEntry, content: string) {
    if (isDemoData || entry.itemType === "stool") return;
    setPending(`note:${entry.itemIdentity}`);
    await setDiaryNoteAndSync(entry.itemIdentity, entry.itemType, date, content.trim() || null);
    await refreshAfterWrite();
    setPending(null);
  }

  async function handleAddNew() {
    if (isDemoData || !tabConfig) return;
    const name = titleCaseFallback(newItemText);
    if (!name) return;
    const key = normalizeName(name);

    // Reuse an existing candidate under the same canonical name instead of
    // creating a duplicate item — matches how the seasonal quick-log
    // suggestions already behave.
    const existingCandidate = candidates.find((c) => c.itemType === tabConfig.type && normalizeName(c.item) === key);
    if (existingCandidate) {
      setNewItemText("");
      setAddingNew(false);
      if (tabConfig.countable) {
        await handleIncrement(existingCandidate);
      } else {
        await handleToggle(existingCandidate);
      }
      return;
    }

    // Archived items aren't in `candidates` above, so check separately —
    // otherwise this would try to create a second item under the same
    // name, which the DB's per-user unique-name constraint rejects.
    const archivedMatch = effective.items.find(
      (i) => i.itemType === tabConfig.type && i.isArchived && normalizeName(i.rawName) === key,
    );
    if (archivedMatch) {
      setDuplicateConflict(archivedMatch);
      return;
    }

    const guessed = tabConfig.type === "food" ? lookupFoodCategory(name, categoryNamesForTab) : null;
    const category = guessed ?? (newItemCategory || categoryNamesForTab[0]);

    setPending("__new__");
    const categoryId = await ensureCategoryId(tabConfig.type, category, effective.categories);
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: tabConfig.type,
      rawName: name,
      category,
      categoryId,
      isArchived: false,
      createdDate: date,
    };
    await putItemAndSync(item);
    if (tabConfig.countable) {
      await incrementDailyLogAndSync(item.identity, item.itemType, date, meal);
    } else {
      await toggleDailyLogAndSync(item.identity, item.itemType, date);
    }
    setNewItemText("");
    setNewItemCategory("");
    setAddingNew(false);
    await refreshAfterWrite();
    setPending(null);
  }

  async function handleUnarchiveDuplicate() {
    if (!duplicateConflict) return;
    setPending("__unarchive-duplicate__");
    const item = { ...duplicateConflict, isArchived: false };
    await putItemAndSync(item);
    setDuplicateConflict(null);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Shared by the seasonal-picks and Poland-catalog quick-log flows:
   * matching an existing item just increments it; a never-tracked food gets
   * created under the given category and logged in the same tap.
   * `pendingKey` is caller-supplied so each surface's own busy check (keyed
   * differently — see handleQuickLogSeasonal/Catalog) lines up. */
  async function createAndLogNewFood(itemName: string, pendingKey: string, category: string) {
    if (isDemoData) return;
    const norm = normalizeName(itemName);
    const existing = candidates.find((c) => c.itemType === "food" && normalizeName(c.item) === norm);
    if (existing) {
      await handleIncrement(existing);
      return;
    }

    setPending(pendingKey);
    const categoryId = await ensureCategoryId("food", category, effective.categories);
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: "food",
      rawName: itemName,
      category,
      categoryId,
      isArchived: false,
      createdDate: date,
    };
    await putItemAndSync(item);
    await incrementDailyLogAndSync(item.identity, "food", date, meal);
    await refreshAfterWrite();
    setPending(null);
  }

  function toggleCategoryCollapsed(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleQuickLogSeasonal(itemName: string) {
    const category = lookupFoodCategory(itemName, foodCategoryNames) ?? foodCategoryNames[0];
    return createAndLogNewFood(itemName, `seasonal:${normalizeName(itemName)}`, category);
  }

  /** Poland-catalog chips already know their own category (see
   * polandFoodCatalog.ts), so — unlike the seasonal-picks flow — this never
   * needs to guess one from the name. */
  function handleQuickLogCatalog(c: LogCandidate) {
    return createAndLogNewFood(c.item, c.key, c.category);
  }

  /** Every chip is a single-tap toggle. For Food specifically, that toggle
   * is per meal, not per day — a food can be logged once per meal, so the
   * same item can be tapped again under Breakfast, Lunch, and Dinner as
   * three separate entries; tapping a food already logged for the
   * currently-selected meal removes just that meal's entry. A catalog-only
   * chip (itemIdentity "" sentinel — see groupedByCategory) has nothing to
   * increment/toggle yet, so its first tap creates the item instead. */
  function handleChipTap(c: LogCandidate) {
    if (c.itemIdentity === "") {
      void handleQuickLogCatalog(c);
      return;
    }
    const logged = (mealCounts.get(c.key) ?? 0) > 0;
    if (tabConfig?.countable) {
      void (logged ? handleDecrement(c) : handleIncrement(c));
    } else {
      void handleToggle(c);
    }
  }

  function stoolLogFromDraft(id: string, entry: NewStoolEntry): RawStoolLog {
    return {
      id,
      date,
      loggedAt: combineDateAndTime(date, entry.loggedAtTime),
      bristolScores: entry.bristolScores,
      noBristol: entry.noBristol,
      color: entry.color,
      floatation: entry.floatation,
      isSticky: entry.isSticky,
      isSmelly: entry.isSmelly,
      isStraining: entry.isStraining,
      hasMucus: entry.hasMucus,
      hasUrgency: entry.hasUrgency,
      hasVisibleFoodParticles: entry.hasVisibleFoodParticles,
      hasIncompleteEvacuation: entry.hasIncompleteEvacuation,
      paperCleanliness: entry.paperCleanliness,
      timeOnToiletMinutes: entry.timeOnToiletMinutes,
      note: null,
      updatedAt: new Date().toISOString(),
    };
  }

  async function handleSaveStoolEntry(entry: NewStoolEntry) {
    if (isDemoData) return;
    const log = stoolLogFromDraft(crypto.randomUUID(), entry);
    await putStoolLogAndSync(log);
    await refreshAfterWrite();
  }

  /** Corrects an already-saved entry in place — same id, so this is an
   * update rather than a second entry alongside the mistaken one. */
  async function handleUpdateStoolEntry(id: string, entry: NewStoolEntry) {
    if (isDemoData) return;
    setPending(id);
    const log = stoolLogFromDraft(id, entry);
    await putStoolLogAndSync(log);
    await refreshAfterWrite();
    setPending(null);
  }

  async function handleDeleteStoolEntry(id: string) {
    if (isDemoData) return;
    setPending(id);
    await deleteStoolLogByIdAndSync(id);
    await refreshAfterWrite();
    setPending(null);
  }

  /** A plain list row, not a pill — available items are just text; a
   * tracked one gets a tinted background, a colored left edge, and a
   * checkmark, which reads as "the strongest state on the row" without
   * needing a heavy rounded shape to do it. */
  function renderChip(c: LogCandidate, accent: string) {
    const logged = (mealCounts.get(c.key) ?? 0) > 0;
    const busy = pending === c.key;

    return (
      <button
        key={c.key}
        type="button"
        onClick={() => handleChipTap(c)}
        disabled={busy}
        className={clsx(
          "flex items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-50",
          !logged && "hover:bg-[var(--page-plane)]",
        )}
        style={{
          background: logged ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
          borderLeft: `2px solid ${logged ? accent : "transparent"}`,
          color: logged ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: logged ? 600 : 400,
        }}
      >
        {logged && (
          <span className="shrink-0" style={{ color: accent }}>
            ✓
          </span>
        )}
        <span className="min-w-0">{c.item}</span>
      </button>
    );
  }

  /** Duration-kind items (Sleep duration) render an hours+minutes picker
   * instead of a tap chip — a magnitude, not an occurrence. Spans the full
   * row width since the stepper needs more room than a plain item cell. */
  function renderDurationControl(c: LogCandidate, accent: string) {
    const loggedMinutes = durationValueForDate.get(c.itemIdentity);
    const logged = loggedMinutes != null;
    // Not logged yet today — start the picker from a sensible anchor
    // (e.g. 7h for sleep) instead of 0h 0m, so most days need only a small
    // nudge. Purely a display default: nothing is saved until the picker
    // is actually touched.
    const minutes = loggedMinutes ?? DURATION_DEFAULT_MINUTES[c.item] ?? 0;
    const busy = pending === c.key;

    return (
      <div
        key={c.key}
        className="col-span-full flex items-center gap-2 rounded-md px-2 py-1.5"
        style={{
          background: logged ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
          borderLeft: `2px solid ${logged ? accent : "transparent"}`,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span className="text-sm whitespace-nowrap" style={{ color: logged ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: logged ? 600 : 400 }}>
          {c.item}
        </span>
        <DurationStepper totalMinutes={minutes} onChange={(m) => void handleSetDuration(c, m)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Log
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {isDemoData
              ? "Example data — this is what a tracked day looks like. Sign in or log something for real to replace it."
              : tab === "stool"
                ? "Log a bowel movement."
                : tabConfig?.countable
                  ? "Tap a food to log it."
                  : "Tap what applies."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BreakfastReminderToggle />
          <div className="flex items-center gap-0.5 rounded-lg border p-1" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            <button
              type="button"
              onClick={() => setDate((d) => addDaysLocal(d, -1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Previous day"
            >
              ‹
            </button>
            <span
              className="min-w-24 rounded-md px-2 py-1 text-center text-sm font-semibold whitespace-nowrap"
              style={{ color: "var(--text-primary)", background: "var(--surface-1)" }}
            >
              {formatDateLabel(date, today)}
            </span>
            <button
              type="button"
              onClick={() => setDate((d) => (d < today ? addDaysLocal(d, 1) : d))}
              disabled={date >= today}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium disabled:opacity-30"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Next day"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* An underlined menu, not pills — deliberately a different shape
         * from "Eaten at" below so the two rows read as different kinds of
         * control: this one switches the whole page's content (primary
         * navigation), that one just tags optional metadata on a food. */}
        <nav className="flex w-fit flex-wrap items-center gap-5 border-b" style={{ borderColor: "var(--border-hairline)" }}>
          {TABS.map((t) => {
            const active = t.type === tab;
            const count = candidates.filter((c) => c.itemType === t.type).length;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTab(t.type)}
                className="flex items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
                style={{
                  color: active ? TYPE_ACCENT[t.type] : "var(--text-secondary)",
                  fontWeight: active ? 700 : 500,
                  borderBottom: `2px solid ${active ? TYPE_ACCENT[t.type] : "transparent"}`,
                  marginBottom: "-1px",
                }}
              >
                {t.label}
                {count > 0 && (
                  <span className="text-xs" style={{ color: active ? TYPE_ACCENT[t.type] : "var(--text-muted)" }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setTab("stool")}
            className="flex items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
            style={{
              color: tab === "stool" ? STOOL_ACCENT : "var(--text-secondary)",
              fontWeight: tab === "stool" ? 700 : 500,
              borderBottom: `2px solid ${tab === "stool" ? STOOL_ACCENT : "transparent"}`,
              marginBottom: "-1px",
            }}
          >
            Stool
            {stoolEntriesForDate.length > 0 && (
              <span className="text-xs" style={{ color: tab === "stool" ? STOOL_ACCENT : "var(--text-muted)" }}>
                {stoolEntriesForDate.length}
              </span>
            )}
          </button>
        </nav>
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {loggedTodayCount} logged {formatDateLabel(date, today).toLowerCase()}
        </span>
      </div>

      {tab === "stool" ? (
        !dataReady ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading…
          </p>
        ) : (
          <StoolTab
            entries={stoolEntriesForDate}
            isDemoData={isDemoData}
            pending={pending}
            accent={STOOL_ACCENT}
            onSave={handleSaveStoolEntry}
            onUpdate={handleUpdateStoolEntry}
            onDelete={handleDeleteStoolEntry}
          />
        )
      ) : (
        <>
          {tabConfig?.countable && dataReady && seasonalPicks.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              <button
                type="button"
                onClick={() => setPicksOpen((v) => !v)}
                className="flex items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-primary)" }}>
                  {monthName} picks
                  <span className="ml-1.5 font-normal normal-case" style={{ color: "var(--text-secondary)" }}>
                    · {seasonalPicks.length} in season
                  </span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 transition-transform"
                  style={{ color: "var(--text-secondary)", transform: picksOpen ? "rotate(180deg)" : "none" }}
                >
                  <path d="M5 7.5 10 12.5 15 7.5" />
                </svg>
              </button>
              {picksOpen && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {seasonalPicksSorted.map((pick) => (
                      <button
                        key={pick.item}
                        type="button"
                        onClick={() => void handleQuickLogSeasonal(pick.item)}
                        disabled={pending === `seasonal:${normalizeName(pick.item)}`}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap disabled:opacity-50"
                        style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
                      >
                        {pick.item}
                        <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                          {pick.weeksSinceLastEaten === null
                            ? "· never"
                            : pick.weeksSinceLastEaten === 0
                              ? "· this week"
                              : `· ${pick.weeksSinceLastEaten}w ago`}
                        </span>
                      </button>
                    ))}
                  </div>
                  {leastTrackedCategory && (
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      This week&apos;s priority: <strong style={{ color: "var(--text-primary)" }}>{leastTrackedCategory.category}</strong> — logged{" "}
                      {leastTrackedCategory.countThisWeek} time{leastTrackedCategory.countThisWeek === 1 ? "" : "s"} so far.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {tabConfig?.countable && (
            <div className="flex flex-wrap items-center gap-1.5">
              {MEAL_OPTIONS.map((m) => {
                const active = m === meal;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMeal(m)}
                    className="rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors"
                    style={{
                      background: active ? TYPE_ACCENT.food : "var(--page-plane)",
                      color: active ? "#fff" : "var(--text-secondary)",
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          {!dataReady || !tabConfig ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Loading…
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedByCategory.length > 0 && (
                <p className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span style={{ color: TYPE_ACCENT[tabConfig.type] }}>✓</span> logged{" "}
                  {tabConfig.countable ? `for ${meal.toLowerCase()}` : formatDateLabel(date, today).toLowerCase()} — tap again to remove
                </p>
              )}

              {!addingNew ? (
                <button
                  type="button"
                  onClick={() => (isDemoData ? openPanel() : setAddingNew(true))}
                  className="self-start rounded-md border border-dashed px-3 py-1.5 text-sm font-medium whitespace-nowrap"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                >
                  {isDemoData ? "+ Can't find it? Sign in to add it" : "+ Can't find it? Add it"}
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAddNew();
                  }}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      placeholder={tabConfig.placeholder}
                      className="w-full max-w-xs rounded-md border px-3.5 py-1.5 text-sm outline-none"
                      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                    />
                    <button
                      type="submit"
                      disabled={!newItemText.trim() || pending === "__new__"}
                      className="rounded-md border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap disabled:opacity-40"
                      style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                    >
                      + Add &amp; log
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingNew(false);
                        setNewItemText("");
                        setNewItemCategory("");
                      }}
                      className="text-sm font-medium underline decoration-dotted"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      cancel
                    </button>
                  </div>
                  {newItemNeedsCategory ? (
                    <label className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      Not sure where this belongs — pick a category:
                      <select
                        value={newItemCategory || categoryNamesForTab[0]}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                        className="rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                      >
                        {categoryNamesForTab.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    newItemText.trim() && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Already recognized — will file under its usual category automatically.
                      </p>
                    )
                  )}
                </form>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupedByCategory.map((group) => {
                  const accent = tab === "food" ? colorForCategorySlot(group.category) : TYPE_ACCENT[tabConfig.type];
                  const icon = tab === "food" ? FOOD_CATEGORY_ICON[group.category] : null;
                  const items = group.items;
                  if (items.length === 0) return null;
                  const collapsed = collapsedCategories.has(group.category);
                  return (
                    <div key={group.category} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                      <button
                        type="button"
                        onClick={() => toggleCategoryCollapsed(group.category)}
                        className="flex items-center gap-1.5 border-b pb-2 text-left text-xs font-bold tracking-wide uppercase"
                        style={{ color: accent, borderColor: "var(--border-hairline)" }}
                      >
                        {icon}
                        {group.category}
                        <span className="ml-auto flex items-center gap-1 font-medium normal-case" style={{ color: "var(--text-secondary)" }}>
                          {items.length}
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }}
                          >
                            <path d="M5 7.5 10 12.5 15 7.5" />
                          </svg>
                        </span>
                      </button>
                      {!collapsed && (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-x-2 gap-y-0.5">
                          {items.map((c) =>
                            INPUT_KIND[c.item] === "duration" ? renderDurationControl(c, accent) : renderChip(c, accent),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {groupedByCategory.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Nothing tracked here yet — add your first {tabConfig.label.toLowerCase().replace(/s$/, "")} below.
                </p>
              )}

              <Link href="/manage/" className="self-start text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
                Don&apos;t see what you&apos;re looking for? Archive or add items on the Manage page
              </Link>
            </div>
          )}
        </>
      )}
      {combinedTimeline.length > 0 && (
        <div className="mt-1 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border-hairline)" }}>
          <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
            Timeline — {formatDateLabel(date, today).toLowerCase()}
          </h2>
          <div className="overflow-x-auto pb-2">
            <div className="relative flex min-w-max items-start gap-4">
              <div className="absolute top-[5px] right-0 left-0 h-px" style={{ background: "var(--border-hairline)" }} />
              {combinedTimeline.map((entry) => {
                const busy = pending === entry.key;
                const hasMealTag = entry.itemType === "food" && (entry.mealTag || !isDemoData);
                const hasNote = entry.itemType !== "stool" && (!isDemoData || entry.note);
                return (
                  <div key={entry.key} className="flex shrink-0 flex-col items-start gap-1" style={{ opacity: busy ? 0.5 : 1 }}>
                    <span
                      className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full border-2"
                      style={{ borderColor: entry.itemType === "stool" ? STOOL_ACCENT : TYPE_ACCENT[entry.itemType], background: "var(--surface-1)" }}
                    />
                    {isDemoData ? (
                      <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {entry.time}
                      </span>
                    ) : (
                      <input
                        type="time"
                        value={toTimeInputValue(entry.updatedAt)}
                        disabled={busy}
                        onChange={(e) => void handleChangeEntryTime(entry, e.target.value)}
                        aria-label={`Change time for ${entry.item}`}
                        className="w-[68px] rounded px-1 py-0.5 font-mono text-[11px] whitespace-nowrap outline-none disabled:opacity-40"
                        style={{ background: "transparent", color: "var(--text-muted)", border: "none" }}
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                        {entry.item}
                        {INPUT_KIND[entry.item] === "duration" && entry.value != null && (
                          <span className="ml-1 font-normal" style={{ color: "var(--text-secondary)" }}>
                            {formatMinutes(entry.value)}
                          </span>
                        )}
                      </span>
                      {!isDemoData && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteEntry(entry)}
                          disabled={busy}
                          aria-label={`Delete ${entry.item} at ${entry.time}`}
                          className="text-xs leading-none disabled:opacity-40"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {hasMealTag &&
                      (entry.itemType === "food" &&
                        (isDemoData ? (
                          entry.mealTag && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
                              style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
                            >
                              {entry.mealTag}
                            </span>
                          )
                        ) : (
                          <select
                            value={entry.mealTag ?? ""}
                            disabled={busy}
                            onChange={(e) => void handleChangeEntryMeal(entry, e.target.value)}
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap outline-none disabled:opacity-40"
                            style={{ background: "var(--page-plane)", color: "var(--text-secondary)", border: "none" }}
                          >
                            <option value="" disabled>
                              set meal
                            </option>
                            {MEAL_OPTIONS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        )))}
                    {hasNote && (
                      <TimelineNote
                        note={entry.note}
                        busy={pending === `note:${entry.itemIdentity}`}
                        hidden={isDemoData}
                        onSave={(content) => void handleSaveNote(entry, content)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {duplicateConflict && (
        <DuplicateItemDialog
          name={duplicateConflict.rawName}
          isArchived={duplicateConflict.isArchived}
          busy={pending === "__unarchive-duplicate__"}
          onClose={() => setDuplicateConflict(null)}
          onUnarchive={() => void handleUnarchiveDuplicate()}
        />
      )}
    </div>
  );
}
