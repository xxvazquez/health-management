"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { pushDiaryEntry, pushUserOverride, syncItemDay } from "@/lib/supabase/sync";
import {
  decrementDailyLog,
  decrementDailyLogForMeal,
  deleteLogById,
  getAllDiary,
  getAllItems,
  getAllLogs,
  getAllUserOverrides,
  incrementDailyLog,
  putItem,
  setDailyDuration,
  setDiaryNote,
  setUserOverride,
  toggleDailyLog,
  updateLogMealTag,
} from "@/lib/db/indexedDb";
import {
  buildLogCandidates,
  dayTimelineEntries,
  generateManualItemId,
  loggedCountsForDate,
  type LogCandidate,
  type TimelineEntry,
} from "@/lib/logCandidates";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import { seasonalPicksForMonth, weeklyCategoryPriority } from "@/lib/aggregations/seasonal";
import { formatMinutes } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import { normalizeName } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, TYPE_ACCENT, colorForCategorySlot, type ItemType } from "@/taxonomy/categories";
import { classifyItem, lookupFoodCategory, type OverrideEntry } from "@/taxonomy/classify";
import { POLAND_FOOD_CATALOG } from "@/taxonomy/polandFoodCatalog";
import { DURATION_DEFAULT_MINUTES, INPUT_KIND } from "@/taxonomy/inputKinds";
import { DurationStepper } from "@/components/ui/DurationStepper";
import type { RawLog, RawItem, RawDiaryEntry } from "@/lib/types";

const TABS: { type: ItemType; label: string; placeholder: string; defaultCategory: string; countable: boolean }[] = [
  { type: "food", label: "Food", placeholder: "Add a food or ingredient…", defaultCategory: "Misc", countable: true },
  { type: "outcome", label: "Symptoms", placeholder: "Add a symptom…", defaultCategory: "Other Symptom", countable: false },
  { type: "supplement", label: "Supplements", placeholder: "Add a supplement…", defaultCategory: "Other", countable: false },
  { type: "habit", label: "Habits", placeholder: "Add a habit…", defaultCategory: "Other", countable: false },
];

const MEAL_OPTIONS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

const HIDDEN_FOOD_ITEMS_KEY = "lauva:hiddenFoodItems";

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

function todayLocalISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  userOverrides: Record<string, OverrideEntry>;
  diary: RawDiaryEntry[];
}

export default function LogPage() {
  const { refresh, isDemoData, status } = useData();
  const { openPanel } = useAuth();
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<ItemType>("food");
  const [addingNew, setAddingNew] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState("");
  const [picksOpen, setPicksOpen] = useState(false);
  const [meal, setMeal] = useState<(typeof MEAL_OPTIONS)[number]>("Breakfast");
  const [newItemText, setNewItemText] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  // View-only declutter for the Food tab's now-large catalog — hiding an
  // ingredient here never touches tracked data, just this device's tap
  // grid, so it's plain localStorage rather than anything synced.
  const [hiddenFoodItems, setHiddenFoodItems] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(HIDDEN_FOOD_ITEMS_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [manageVisibility, setManageVisibility] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const [items, logs, userOverrides, diary] = await Promise.all([
      getAllItems(),
      getAllLogs(),
      getAllUserOverrides(),
      getAllDiary(),
    ]);
    setSnapshot({ items, logs, userOverrides, diary });
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
        ? { items: demo.items, logs: demo.logs, userOverrides: {}, diary: [] }
        : (snapshot ?? { items: [], logs: [], userOverrides: {}, diary: [] }),
    [demo, snapshot],
  );

  const candidates = useMemo(
    () => buildLogCandidates(effective.items, effective.logs, effective.userOverrides),
    [effective],
  );

  const counts = useMemo(
    () => loggedCountsForDate(effective.items, effective.logs, effective.userOverrides, date),
    [effective, date],
  );

  const tabConfig = TABS.find((t) => t.type === tab)!;

  // For the Food tab specifically, a chip's checkmark reflects whether it
  // was logged for the *currently selected meal*, not the whole day — so
  // switching from Breakfast to Lunch shows everything unticked again and
  // milk can be logged separately for breakfast, lunch, and dinner instead
  // of one tap toggling a single day-wide entry.
  const mealCounts = useMemo(
    () => (tabConfig.countable ? loggedCountsForDate(effective.items, effective.logs, effective.userOverrides, date, meal) : counts),
    [effective, date, meal, tabConfig.countable, counts],
  );

  // For duration-kind items (currently just Sleep duration): the actual
  // logged value for the day, keyed by item identity — a plain tap count
  // doesn't mean anything for these, only the value does.
  const durationValueForDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of effective.logs) {
      if (l.date !== date || l.isSkipped || l.value == null) continue;
      map.set(l.itemIdentity, l.value);
    }
    return map;
  }, [effective, date]);

  const tabCandidates = useMemo(() => candidates.filter((c) => c.itemType === tab), [candidates, tab]);

  // True once a typed "add new" name doesn't match any known keyword and
  // (for food specifically) can't be guessed from the name either — the
  // point where silently filing it under Misc/Other would be a guess, not a
  // classification. Lets the form ask instead of guessing wrong.
  const trimmedNewItemText = newItemText.trim();
  const newItemNeedsCategory = useMemo(() => {
    if (!trimmedNewItemText) return false;
    const bundled = classifyItem(trimmedNewItemText, {});
    if (bundled.matchedBy !== "fallback") return false;
    if (tabConfig.type === "food" && lookupFoodCategory(trimmedNewItemText)) return false;
    return true;
  }, [trimmedNewItemText, tabConfig.type]);

  // Grouped in the taxonomy's fixed category order (not by frequency), so a
  // category always sits in the same place and the alphabetical list inside
  // it never reshuffles — the whole point is finding a specific item by eye
  // without typing. For Food specifically, also folds in the Poland catalog
  // (src/taxonomy/polandFoodCatalog.ts) so browsing isn't limited to what's
  // already been tracked — a catalog-only entry gets itemIdentity "" as a
  // sentinel: nothing exists in the db for it yet, so tapping it creates the
  // item first (see handleChipTap / handleQuickLogCatalog) rather than
  // incrementing a real log row.
  const groupedByCategory = useMemo(() => {
    const byCategory = new Map<string, LogCandidate[]>();
    for (const c of tabCandidates) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }
    if (tab === "food") {
      const known = new Set(tabCandidates.map((c) => normalizeName(c.item)));
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
    return CATEGORIES_BY_TYPE[tab]
      .map((category) => ({ category, items: byCategory.get(category) ?? [] }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [tabCandidates, tab]);

  const loggedTodayCount = useMemo(
    () => candidates.filter((c) => (counts.get(c.key) ?? 0) > 0).length,
    [candidates, counts],
  );

  const dayTimeline = useMemo(
    () => dayTimelineEntries(effective.items, effective.logs, effective.userOverrides, effective.diary, date),
    [effective, date],
  );

  // Unfiltered canonical events (no archived-item or date-range filtering,
  // unlike the dashboards' DataContext) so "weeks since last eaten" stays
  // accurate even for something that went quiet long enough to be archived
  // from the regular dashboards.
  const seasonalCanonical = useMemo(
    () => buildCanonicalEvents(effective.items, effective.logs, [], effective.userOverrides).events,
    [effective],
  );

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
    await incrementDailyLog(candidate.itemIdentity, date, tabConfig.countable ? meal : null);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(candidate.itemIdentity, date);
  }

  async function handleDecrement(candidate: LogCandidate) {
    if (isDemoData) return;
    setPending(candidate.key);
    if (tabConfig.countable) {
      await decrementDailyLogForMeal(candidate.itemIdentity, date, meal);
    } else {
      await decrementDailyLog(candidate.itemIdentity, date);
    }
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(candidate.itemIdentity, date);
  }

  async function handleToggle(candidate: LogCandidate) {
    if (isDemoData) return;
    setPending(candidate.key);
    await toggleDailyLog(candidate.itemIdentity, date);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(candidate.itemIdentity, date);
  }

  /** Sets (or overwrites) a duration-kind item's value for the day — one
   * log per item per day, upserted by a deterministic identity, unlike the
   * increment/toggle flows above which add or remove whole rows. The raw
   * minutes are always what's stored; nothing here ever reduces it to a
   * boolean or a bucket — that only happens later, read-only, in analysis. */
  async function handleSetDuration(candidate: LogCandidate, totalMinutes: number) {
    if (isDemoData) return;
    setPending(candidate.key);
    await setDailyDuration(candidate.itemIdentity, date, totalMinutes);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(candidate.itemIdentity, date);
  }

  /** Undoes a specific mistaken tap from the day's timeline — deletes that
   * exact entry, locally and (once synced) in Supabase too. */
  async function handleDeleteEntry(entry: TimelineEntry) {
    if (isDemoData) return;
    setPending(entry.key);
    await deleteLogById(entry.key);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(entry.itemIdentity, date);
  }

  /** Corrects the meal tag on an already-logged entry, e.g. something typed
   * as Lunch that was actually Dinner. */
  async function handleChangeEntryMeal(entry: TimelineEntry, mealTag: string) {
    if (isDemoData) return;
    setPending(entry.key);
    await updateLogMealTag(entry.key, mealTag);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(entry.itemIdentity, date);
  }

  /** Optional context for one item on one day — structured data first, this
   * is just a short note attached to it, never a required field. */
  async function handleSaveNote(entry: TimelineEntry, content: string) {
    if (isDemoData) return;
    setPending(`note:${entry.itemIdentity}`);
    const saved = await setDiaryNote(entry.itemIdentity, date, content.trim() || null);
    await refreshAfterWrite();
    setPending(null);
    void pushDiaryEntry(saved);
  }

  async function handleAddNew() {
    if (isDemoData) return;
    const name = newItemText.trim();
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

    const identity = generateManualItemId(key);
    // The bundled taxonomy may already know this exact name (e.g. "Sleep
    // duration") — use that classification as-is rather than shadowing it
    // with a fresh user override defaulted to this tab's generic category.
    // Otherwise, for food specifically, guess a real category from the name
    // (so a typed "Kohlrabi" lands under Veggies, not a catch-all Misc
    // bucket); if that guess also comes up empty, use whatever the form's
    // category picker is showing — same fallback-to-first-option expression
    // the <select> itself renders, so this always matches what's on screen
    // even if the user never touched the dropdown.
    const bundled = classifyItem(name, {});
    const needsOverride = bundled.matchedBy === "fallback";
    const guessedCategory = tabConfig.type === "food" ? lookupFoodCategory(name) : null;
    const category = needsOverride ? (guessedCategory ?? (newItemCategory || CATEGORIES_BY_TYPE[tabConfig.type][0])) : bundled.category;

    setPending("__new__");
    if (needsOverride) {
      const override: OverrideEntry = {
        canonicalName: name,
        itemType: tabConfig.type,
        category,
        subcategory: category,
      };
      await setUserOverride(key, override);
      void pushUserOverride(key, override);
    }
    await putItem({
      identity,
      rawName: name,
      unit: null,
      kind: null,
      frequency: null,
      isRemoved: false,
      isArchived: false,
      createdDate: date,
    });
    if (tabConfig.countable) {
      await incrementDailyLog(identity, date, meal);
    } else {
      await toggleDailyLog(identity, date);
    }
    setNewItemText("");
    setNewItemCategory("");
    setAddingNew(false);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(identity, date);
  }

  /** Shared by the seasonal-picks and Poland-catalog quick-log flows:
   * matching an existing item just increments it; a never-tracked food gets
   * created under the given (or best-guessed) category and logged in the
   * same tap. `pendingKey` is caller-supplied so each surface's own busy
   * check (keyed differently — see handleQuickLogSeasonal/Catalog) lines up. */
  async function createAndLogNewFood(itemName: string, pendingKey: string, category: string) {
    if (isDemoData) return;
    const norm = normalizeName(itemName);
    const existing = candidates.find((c) => c.itemType === "food" && normalizeName(c.item) === norm);
    if (existing) {
      await handleIncrement(existing);
      return;
    }

    setPending(pendingKey);
    const identity = generateManualItemId(norm);
    const override: OverrideEntry = { canonicalName: itemName, itemType: "food", category, subcategory: category };
    await setUserOverride(norm, override);
    await putItem({
      identity,
      rawName: itemName,
      unit: null,
      kind: null,
      frequency: null,
      isRemoved: false,
      isArchived: false,
      createdDate: date,
    });
    await incrementDailyLog(identity, date, meal);
    await refreshAfterWrite();
    setPending(null);
    void pushUserOverride(norm, override);
    void syncItemDay(identity, date);
  }

  function toggleCategoryCollapsed(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  /** Hides (or restores) one food from the tap grid — a display-only
   * preference local to this device, never touching tracked history or the
   * item's classification. */
  function setFoodItemHidden(item: string, hidden: boolean) {
    const norm = normalizeName(item);
    setHiddenFoodItems((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(norm);
      else next.delete(norm);
      try {
        window.localStorage.setItem(HIDDEN_FOOD_ITEMS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // localStorage unavailable (private browsing etc.) — toggle still works for this session
      }
      return next;
    });
  }

  function handleQuickLogSeasonal(itemName: string) {
    return createAndLogNewFood(itemName, `seasonal:${normalizeName(itemName)}`, lookupFoodCategory(itemName) ?? "Misc");
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
    if (tabConfig.countable) {
      void (logged ? handleDecrement(c) : handleIncrement(c));
    } else {
      void handleToggle(c);
    }
  }

  /** Food tab's "manage visibility" mode swaps every chip for this row —
   * name plus a plain Hide/Show toggle, no logging affordance — so hiding a
   * few unwanted ingredients can't be confused with tapping to log one. */
  function renderManageRow(c: LogCandidate, accent: string) {
    const hidden = hiddenFoodItems.has(normalizeName(c.item));
    return (
      <div key={c.key} className="col-span-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm">
        <span
          className="min-w-0 flex-1"
          style={{ color: hidden ? "var(--text-muted)" : "var(--text-secondary)", textDecoration: hidden ? "line-through" : "none" }}
        >
          {c.item}
        </span>
        <button
          type="button"
          onClick={() => setFoodItemHidden(c.item, !hidden)}
          className="shrink-0 text-xs font-medium underline decoration-dotted"
          style={{ color: hidden ? accent : "var(--text-muted)" }}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
    );
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
              : tabConfig.countable
                ? "Tap a food to log it."
                : "Tap what applies."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border p-1" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
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
        </nav>
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {loggedTodayCount} logged {formatDateLabel(date, today).toLowerCase()}
        </span>
      </div>

      {tabConfig.countable && dataReady && seasonalPicks.length > 0 && (
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

      {tabConfig.countable && (
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

      {!dataReady ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groupedByCategory.length > 0 && (
            <p className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <span style={{ color: TYPE_ACCENT[tab] }}>✓</span> logged{" "}
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
                    value={newItemCategory || CATEGORIES_BY_TYPE[tabConfig.type][0]}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="rounded-md border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                  >
                    {CATEGORIES_BY_TYPE[tabConfig.type].map((c) => (
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
              const accent = tab === "food" ? colorForCategorySlot(group.category) : TYPE_ACCENT[tab];
              const icon = tab === "food" ? FOOD_CATEGORY_ICON[group.category] : null;
              const items =
                tab === "food" && !manageVisibility
                  ? group.items.filter((c) => !hiddenFoodItems.has(normalizeName(c.item)))
                  : group.items;
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
                        tab === "food" && manageVisibility
                          ? renderManageRow(c, accent)
                          : INPUT_KIND[c.item] === "duration"
                            ? renderDurationControl(c, accent)
                            : renderChip(c, accent),
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

          {tab === "food" && (groupedByCategory.length > 0 || hiddenFoodItems.size > 0) && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setManageVisibility((v) => !v)}
                className="font-medium underline decoration-dotted"
                style={{ color: "var(--text-secondary)" }}
              >
                {manageVisibility ? "Done" : "Hide ingredients you don't use"}
              </button>
              {hiddenFoodItems.size > 0 && !manageVisibility && (
                <span style={{ color: "var(--text-muted)" }}>
                  {hiddenFoodItems.size} hidden
                </span>
              )}
            </div>
          )}

          {dayTimeline.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border-hairline)" }}>
              <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
                Timeline — {formatDateLabel(date, today).toLowerCase()}
              </h2>
              <div className="overflow-x-auto pb-2">
                <div className="relative flex min-w-max items-start gap-4">
                  <div className="absolute top-[5px] right-0 left-0 h-px" style={{ background: "var(--border-hairline)" }} />
                  {dayTimeline.map((entry) => {
                    const busy = pending === entry.key;
                    const hasMealTag = entry.itemType === "food" && (entry.mealTag || !isDemoData);
                    const hasNote = !isDemoData || entry.note;
                    return (
                      <div key={entry.key} className="flex shrink-0 flex-col items-start gap-1" style={{ opacity: busy ? 0.5 : 1 }}>
                        <span
                          className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full border-2"
                          style={{ borderColor: TYPE_ACCENT[entry.itemType], background: "var(--surface-1)" }}
                        />
                        <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {entry.time}
                        </span>
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
        </div>
      )}
    </div>
  );
}
