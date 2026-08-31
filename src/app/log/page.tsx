"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { useVisibleDomains, type TrackedDomain } from "@/lib/visibleDomains";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  setDiaryNoteAndSync,
  incrementDailyLogAndSync,
  deleteLogByIdAndSync,
  putItemAndSync,
  putStoolLogAndSync,
  deleteStoolLogByIdAndSync,
  putWorkoutLogAndSync,
  deleteWorkoutLogAndSync,
  putPeriodLogAndSync,
  deletePeriodLogAndSync,
  setDailyDurationAndSync,
  toggleDailyLogAndSync,
  updateLogMealTagAndSync,
  updateLogTimeAndSync,
  updateStoolLogTimeAndSync,
  decrementDailyLogAndSync,
  decrementDailyLogForMealAndSync,
} from "@/lib/supabase/sync";
import { getAllDiary, getAllItems, getAllLogs, getAllCategories, getAllStoolLogs, getAllWorkoutLogs, getAllPeriodLogs, withDataLock } from "@/lib/db/indexedDb";
import {
  buildLogCandidates,
  combineDateAndTime,
  dayTimelineEntries,
  decideChipTapAction,
  defaultLogTimeValue,
  loggedCountsForDate,
  toTimeInputValue,
  type LogCandidate,
  type TimelineEntry,
} from "@/lib/logCandidates";
import { buildCanonicalEvents } from "@/lib/canonical/buildCanonicalEvents";
import { createTimeOrderedId } from "@/lib/sortableId";
import { ensureCategoryId, ensureDefaultWorkoutItems } from "@/lib/categoryResolution";
import { seasonalPicksForMonth, weeklyCategoryPriority } from "@/lib/aggregations/seasonal";
import { formatMinutes, todayLocalISODate } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import { normalizeName, titleCaseFallback } from "@/taxonomy/normalizeName";
import { TYPE_ACCENT, colorForCategorySlot, effectiveCategoryList, type ItemType } from "@/taxonomy/categories";
import { lookupFoodCategory } from "@/taxonomy/classify";
import { POLAND_FOOD_CATALOG } from "@/taxonomy/polandFoodCatalog";
import { BAND_OPTIONS, DURATION_DEFAULT_MINUTES, INPUT_KIND, activeBandValue, bandLabelForValue } from "@/taxonomy/inputKinds";
import { DurationStepper } from "@/components/ui/DurationStepper";
import { NumberStepper, UNIT_STEP_PRESETS } from "@/components/ui/NumberStepper";
import { StoolTab, type NewStoolEntry, characteristicLabels } from "@/components/log/StoolTab";
import { WorkoutTab, type NewWorkoutEntry } from "@/components/log/WorkoutTab";
import { CycleTab } from "@/components/log/CycleTab";
import { TAB_ICON } from "@/components/tabIcons";
import { DuplicateItemDialog } from "@/components/ui/DuplicateItemDialog";
import { SearchField } from "@/components/ui/SearchField";
import { TabRail } from "@/components/ui/TabRail";
import { useOverflowFade } from "@/lib/useOverflowFade";
import {
  workoutUnitLabel,
  type RawLog,
  type RawItem,
  type RawDiaryEntry,
  type RawCategory,
  type RawStoolLog,
  type RawWorkoutLog,
  type RawPeriodLog,
  type PeriodIntensity,
  type CollectionMethod,
  type WorkoutExercise,
  type WorkoutUnit,
} from "@/lib/types";

const TABS: { type: ItemType; label: string; singular: string; placeholder: string; defaultCategory: string; countable: boolean }[] = [
  { type: "food", label: "Food", singular: "food", placeholder: "Add a food or ingredient…", defaultCategory: "Misc", countable: true },
  { type: "outcome", label: "Symptoms", singular: "symptom", placeholder: "Add a symptom…", defaultCategory: "Other Symptom", countable: false },
  // Countable (not a plain toggle) since a supplement is often taken more
  // than once a day — morning/afternoon/night, same idea as Food's meal
  // tags, so a second dose doesn't just remove the first one's log.
  { type: "supplement", label: "Supplements", singular: "supplement", placeholder: "Add a supplement…", defaultCategory: "Other", countable: true },
  { type: "habit", label: "Habits", singular: "habit", placeholder: "Add a habit…", defaultCategory: "Daily", countable: false },
];

type LogTab = ItemType | "stool" | "workout" | "cycle";
const STOOL_ACCENT = "var(--series-indigo)";
// Distinct from every TYPE_ACCENT and from STOOL_ACCENT so all seven tabs
// stay visually distinguishable at a glance in this one nav row. Matches
// TYPE_ACCENT.workout in taxonomy/categories.ts — kept as its own constant
// here (rather than imported) since this file also needs accents for
// stool/cycle, which aren't real ItemTypes and have no TYPE_ACCENT entry.
const WORKOUT_ACCENT = "var(--series-6)";
const CYCLE_ACCENT = "var(--series-4)";

const COLLAPSED_CATEGORIES_STORAGE_KEY = "lauva.log.collapsedCategories";

function categoryStorageKey(itemType: ItemType, category: string): string {
  return `${itemType}:${category}`;
}

const MEAL_OPTIONS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
const SUPPLEMENT_TIME_OPTIONS = ["Morning", "Afternoon", "Night"] as const;

/** Guesses which meal is being logged from the current time of day, so the
 * selector starts on something plausible instead of always "Breakfast" —
 * still just a starting point, never locked in. Snack is never auto-picked;
 * it's always a deliberate choice. */
function defaultMealForTime(now: Date = new Date()): (typeof MEAL_OPTIONS)[number] {
  const h = now.getHours();
  if (h < 12) return "Breakfast";
  if (h < 18) return "Lunch";
  return "Dinner";
}

/** Same idea as `defaultMealForTime`, for Supplements' own tag set. */
function defaultSupplementTimeForTime(now: Date = new Date()): (typeof SUPPLEMENT_TIME_OPTIONS)[number] {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 12 * 60) return "Morning";
  if (minutes < 18 * 60) return "Afternoon";
  return "Night";
}

/** Which tag chips a given item type's entries get — Food's meals,
 * Supplements' morning/afternoon/night, or none for anything else (that's
 * what gates the whole tag row/column off for those types). */
function tagOptionsForType(type: string): readonly string[] {
  if (type === "food") return MEAL_OPTIONS;
  if (type === "supplement") return SUPPLEMENT_TIME_OPTIONS;
  return [];
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
  Spices: (
    <CategoryIconWrap>
      <path d="M7.5 8h5l.7 7a1 1 0 0 1-1 1.1H7.8A1 1 0 0 1 6.8 15L7.5 8Z" />
      <path d="M8 8V5.5a2 2 0 0 1 4 0V8" />
      <path d="M9 4.6h2M8.7 6h2.6" />
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
      <p className="w-full text-xs break-words whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
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
        className="flex w-full flex-col items-start gap-1"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="Add a note…"
          className="w-full min-w-0 rounded-md border px-1.5 py-0.5 text-xs outline-none"
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
      className="flex w-full items-start gap-1 text-left text-xs disabled:opacity-40"
      style={{ color: "var(--text-secondary)" }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 opacity-70"
      >
        <path d="M13.5 3.5 16.5 6.5 7 16H4v-3Z" />
      </svg>
      <span className="break-words whitespace-pre-wrap">{note}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={busy}
      className="self-start text-xs whitespace-nowrap underline decoration-dotted disabled:opacity-40"
      style={{ color: "var(--text-muted)" }}
    >
      + note
    </button>
  );
}

/** Workout entries only — what was logged (value + unit), read-only by
 * default same as every other field on this card; tapping Edit swaps in
 * the same tap stepper the Workout tab itself uses, so correcting a set
 * here never means retyping it. */
function TimelineWorkoutValue({
  value,
  unit,
  accent,
  busy,
  hidden,
  onChange,
}: {
  value: number;
  unit: WorkoutUnit;
  accent: string;
  busy: boolean;
  hidden: boolean;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <NumberStepper compact value={value} onChange={onChange} unit={workoutUnitLabel(unit)} accent={accent} {...UNIT_STEP_PRESETS[unit]} />;
  }

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {value} {workoutUnitLabel(unit)}
      </span>
      {!hidden && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="whitespace-nowrap underline decoration-dotted disabled:opacity-40"
          style={{ color: "var(--text-muted)" }}
        >
          Edit
        </button>
      )}
    </span>
  );
}

interface Snapshot {
  items: RawItem[];
  logs: RawLog[];
  diary: RawDiaryEntry[];
  categories: RawCategory[];
  stoolLogs: RawStoolLog[];
  workoutLogs: RawWorkoutLog[];
  periodLogs: RawPeriodLog[];
}

export default function LogPage() {
  const { refresh, isDemoData, status } = useData();
  const { isHidden } = useVisibleDomains();
  const { openPanel } = useAuth();
  // Personal notes / reminders / expiration — self-contained state + Supabase
  // wiring, rendered by the three tabs after Journal.
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<LogTab>("food");
  const [addingNew, setAddingNew] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState("");
  const [duplicateConflict, setDuplicateConflict] = useState<RawItem | null>(null);
  const [picksOpen, setPicksOpen] = useState(false);
  // Filters the category grid below by name — cleared on tab switch since
  // each tab's items are a different set (see selectTab).
  const [search, setSearch] = useState("");
  // Food's meal or Supplements' time-of-day tag, depending on which of the
  // two countable tabs is active — reset to a fresh time-of-day guess in
  // selectTab whenever you switch between them, since a value from one set
  // ("Lunch") isn't meaningful in the other.
  const [meal, setMeal] = useState<string>(defaultMealForTime);
  // What time a tap logs something as — lets you log at 9pm something you
  // actually did at 10am, same idea as Stool's own time field. Stays as
  // set (doesn't reset after each tap) so logging several things at the
  // same earlier time doesn't mean re-picking it every time; doesn't reset
  // on date navigation either, since the time-of-day is independent of
  // which day it's applied to.
  const [logTime, setLogTime] = useState(() => defaultLogTimeValue());
  // The Time field stays collapsed to a small "now · change" link until
  // it's needed — either the user opens it, or a past date is picked
  // (handled by `timeIsExplicit` at render).
  const [showTimeField, setShowTimeField] = useState(false);
  // Workout's own copy of the same idea as `logTime` above — it renders
  // outside the shared `tabConfig`-gated block (see the render below), same
  // as Stool's own `loggedAtTime` draft field.
  const [workoutTime, setWorkoutTime] = useState(() => defaultLogTimeValue());
  const [newItemText, setNewItemText] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Symptom tap-cycle: taps are optimistic and coalesced. Each tap bumps
  // the shown intensity immediately (absent → 1 → 2 → 3 → absent) via
  // `symptomTargets`; a single debounced write persists the settled value.
  // Without this, four quick taps all read the same pre-write snapshot and
  // the symptom never advances past 1 or clears. `symptomTargetsRef` mirrors
  // the state so the debounced commit reads the value the user landed on.
  const [symptomTargets, setSymptomTargets] = useState<Map<string, number | null>>(() => new Map());
  const symptomTargetsRef = useRef(symptomTargets);
  const symptomTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Persisted across navigation/reloads (localStorage, keyed per item type so
  // same-named categories in different tabs don't collide) — defaults to
  // empty (everything expanded) until the mount effect below hydrates it
  // from whatever the user last chose, so this never overrides a saved
  // choice with a fresh reset. Desktop always renders expanded regardless
  // of this set (see the `lg:grid` override at the item grid below); only
  // mobile actually collapses, so the set only matters there.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_CATEGORIES_STORAGE_KEY);
      // Reading from localStorage on mount — an external-system read, not a
      // React-state sync loop, same pattern as DataContext's mount effects.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCollapsedCategories(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt or inaccessible storage — fall back to everything expanded.
    }
  }, []);
  // If the tab you're sitting on gets hidden from under you (toggled off
  // in Manage, in another tab, or restored from a stale saved choice),
  // jump to the first tab that's still visible rather than rendering a
  // tab nobody can reach via the nav bar anymore.
  useEffect(() => {
    if (!isHidden(tab)) return;
    const fallback = ([...TABS.map((t) => t.type), "stool", "workout", "cycle"] as TrackedDomain[]).find((t) => !isHidden(t));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fallback) setTab(fallback);
  }, [tab, isHidden]);
  // Which stool timeline cards have their extra details (color, floatation,
  // characteristics, paper cleanliness, time on toilet) expanded — collapsed
  // by default since a 144px-wide card has no room to show them all at once.
  const [expandedStoolIds, setExpandedStoolIds] = useState<Set<string>>(new Set());
  const timelineRef = useOverflowFade<HTMLDivElement>();

  const loadSnapshot = useCallback(async () => {
    // One atomic read against withDataLock — pullFromCloud's destructive
    // clear-and-repopulate is also one withDataLock call (see sync.ts), so
    // this can never land mid-pull and see an empty or half-repopulated
    // cache across these seven stores.
    const [items, logs, diary, categories, stoolLogs, workoutLogs, periodLogs] = await withDataLock(() =>
      Promise.all([getAllItems(), getAllLogs(), getAllDiary(), getAllCategories(), getAllStoolLogs(), getAllWorkoutLogs(), getAllPeriodLogs()]),
    );
    setSnapshot({ items, logs, diary, categories, stoolLogs, workoutLogs, periodLogs });
  }, []);

  useEffect(() => {
    const timers = symptomTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    // Re-reads local IndexedDB whenever the shared data status changes —
    // covers both the initial mount and the global sign-in pull-from-cloud
    // (DataContext) landing, without this page issuing its own Supabase
    // fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSnapshot();
  }, [status, loadSnapshot]);

  // One-time bootstrap for a signed-in user with no workout items yet (see
  // ensureDefaultWorkoutItems's own doc comment) — guarded by a ref so it
  // fires once per snapshot load rather than on every re-render, and only
  // once real (non-demo) data has actually loaded.
  const bootstrappedWorkoutItems = useRef(false);
  useEffect(() => {
    if (isDemoData || !snapshot || bootstrappedWorkoutItems.current) return;
    if (snapshot.items.some((i) => i.itemType === "workout")) {
      bootstrappedWorkoutItems.current = true;
      return;
    }
    bootstrappedWorkoutItems.current = true;
    void ensureDefaultWorkoutItems().then(() => void loadSnapshot());
  }, [isDemoData, snapshot, loadSnapshot]);

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
        ? { items: demo.items, logs: demo.logs, diary: [], categories: [], stoolLogs: demo.stoolLogs, workoutLogs: demo.workoutLogs, periodLogs: demo.periodLogs }
        : (snapshot ?? { items: [], logs: [], diary: [], categories: [], stoolLogs: [], workoutLogs: [], periodLogs: [] }),
    [demo, snapshot],
  );

  function selectTab(t: LogTab) {
    setTab(t);
    setSearch("");
    if (t === "food") setMeal(defaultMealForTime());
    else if (t === "supplement") setMeal(defaultSupplementTimeForTime());
  }

  const candidates = useMemo(() => buildLogCandidates(effective.items, effective.logs), [effective]);

  const counts = useMemo(() => loggedCountsForDate(effective.logs, date), [effective, date]);

  const tabConfig = TABS.find((t) => t.type === tab);

  // The whole tab bar as data — the seven tracking domains, each dropping
  // out when hidden from Manage. (Journal / private notes / reminders /
  // expiry moved to their own /personal page.)
  const logTabs = useMemo(() => {
    const all: { id: LogTab; label: string; accent: string; domain?: TrackedDomain }[] = [
      ...TABS.map((t) => ({ id: t.type as LogTab, label: t.label, accent: TYPE_ACCENT[t.type], domain: t.type })),
      { id: "stool", label: "Stool", accent: STOOL_ACCENT, domain: "stool" },
      { id: "workout", label: "Workout", accent: WORKOUT_ACCENT, domain: "workout" },
      { id: "cycle", label: "Cycle", accent: CYCLE_ACCENT, domain: "cycle" },
    ];
    return all.filter((t) => !t.domain || !isHidden(t.domain));
  }, [isHidden]);
  const activeLogTab = logTabs.find((t) => t.id === tab);

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

  // "Your usual" — the handful of foods logged most across all history,
  // pinned above the catalog so the common case is one tap, not a scroll.
  // Only for Food (its list is the longest); hidden until there's a real
  // pattern to show.
  const frequentFoods = useMemo(() => {
    if (tab !== "food") return [];
    return candidates
      .filter((c) => c.itemType === "food" && c.count > 0)
      .sort((a, b) => b.count - a.count || a.item.localeCompare(b.item))
      .slice(0, 8);
  }, [candidates, tab]);

  const stoolEntriesForDate = useMemo(
    () =>
      effective.stoolLogs
        .filter((s) => s.date === date)
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    [effective, date],
  );

  const workoutEntriesForDate = useMemo(
    () => effective.workoutLogs.filter((g) => g.date === date).sort((a, b) => b.updatedAt - a.updatedAt),
    [effective, date],
  );

  // Most recent weight per exercise across all history (not just this day)
  // — WorkoutTab's prefill convenience, same idea as the old Workout-page
  // form's own prefill.
  const workoutLastWeights = useMemo(() => {
    const map: Partial<Record<WorkoutExercise, number>> = {};
    const seenAt: Partial<Record<WorkoutExercise, string>> = {};
    for (const g of effective.workoutLogs) {
      if (!seenAt[g.exercise] || g.date > seenAt[g.exercise]!) {
        seenAt[g.exercise] = g.date;
        map[g.exercise] = g.weightKg;
      }
    }
    return map;
  }, [effective]);

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
    // Case-insensitive (`sensitivity: "base"` ignores case) with a strict
    // secondary compare so differently-cased near-duplicates still land in
    // one deterministic order instead of whatever order they happened to
    // come in.
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.item.localeCompare(b.item, undefined, { sensitivity: "base" }) || a.item.localeCompare(b.item));
    }
    // Search narrows what's shown but never what's tracked — a category
    // whose every item gets filtered out just drops out of the grid below
    // (via the empty-group filter a few lines down) rather than showing an
    // empty card.
    const query = search.trim().toLowerCase();
    if (query) {
      for (const [category, list] of byCategory) {
        byCategory.set(
          category,
          list.filter((c) => c.item.toLowerCase().includes(query)),
        );
      }
    }
    // The real category list, unioned with whatever category names actually
    // showed up on a candidate/catalog entry — never drops a real item's
    // category just because it isn't in the "official" list.
    const allCategoryNames = new Set([...categoryNamesForTab, ...byCategory.keys()]);
    return Array.from(allCategoryNames)
      .map((category) => ({ category, items: byCategory.get(category) ?? [] }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [tabCandidates, tab, tabConfig, categoryNamesForTab, effective.items, search]);

  const dayTimeline = useMemo(
    () => dayTimelineEntries(effective.items, effective.logs, effective.diary, date),
    [effective, date],
  );

  // Every workout item, active or archived — archived ones still need to
  // resolve older timeline entries/notes correctly by name, same reasoning
  // as the Food catalog's `known` set above.
  const workoutItems = useMemo(() => effective.items.filter((i) => i.itemType === "workout"), [effective.items]);
  const workoutItemIdByName = useMemo(
    () => new Map(workoutItems.map((i) => [normalizeName(i.rawName), i.identity])),
    [workoutItems],
  );
  const workoutItemById = useMemo(() => new Map(workoutItems.map((i) => [i.identity, i])), [workoutItems]);

  // Active exercises grouped by category for the Workout tab's row-per-
  // exercise picker — same case-insensitive, deterministic A-Z sort as the
  // Food category grid above, and the real category rows (falling back to
  // the built-in defaults only as a bootstrap seed), same rule as every
  // other type's categoryNamesForTab.
  const workoutGroupedByCategory = useMemo(() => {
    const activeWorkoutItems = workoutItems.filter((i) => !i.isArchived);
    const customCategories = effective.categories.filter((c) => c.itemType === "workout").map((c) => c.name);
    const categoryNames = effectiveCategoryList("workout", customCategories);
    const byCategory = new Map<string, RawItem[]>();
    for (const item of activeWorkoutItems) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.rawName.localeCompare(b.rawName, undefined, { sensitivity: "base" }) || a.rawName.localeCompare(b.rawName));
    }
    const allCategoryNames = new Set([...categoryNames, ...byCategory.keys()]);
    return Array.from(allCategoryNames)
      .map((category) => ({ category, items: byCategory.get(category) ?? [] }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [workoutItems, effective.categories]);

  // Stool and Workout have no item/category of their own the way
  // food/supplements/habits/symptoms do (Workout's `workout_logs` links to
  // an exercise by name, not identity — see RawWorkoutLog's own comment), but
  // both still belong in the same day timeline — mapped into the same
  // shape and merged in, sorted back together by the instant each one
  // actually happened rather than kept as separate lists.
  const combinedTimeline = useMemo(() => {
    const stoolAsTimeline: TimelineEntry[] = stoolEntriesForDate.map((s) => ({
      key: s.id,
      item: `Bristol ${s.bristolScores.join(", ")}`,
      itemType: "stool",
      itemIdentity: s.id,
      time: new Date(s.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      updatedAt: s.loggedAt,
      mealTag: null,
      value: null,
      note: s.note,
      category: null,
      unit: null,
    }));
    const workoutNotesByItemIdentity = new Map(
      effective.diary.filter((d) => d.itemType === "workout" && d.date === date && d.content).map((d) => [d.itemIdentity, d.content as string]),
    );
    const workoutAsTimeline: TimelineEntry[] = workoutEntriesForDate.map((g) => {
      const itemIdentity = workoutItemIdByName.get(normalizeName(g.exercise)) ?? "";
      const workoutItem = itemIdentity ? workoutItemById.get(itemIdentity) : undefined;
      return {
        key: g.id,
        item: g.exercise,
        itemType: "workout",
        itemIdentity,
        time: new Date(g.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        updatedAt: new Date(g.updatedAt).toISOString(),
        mealTag: null,
        value: g.weightKg,
        note: itemIdentity ? (workoutNotesByItemIdentity.get(itemIdentity) ?? null) : null,
        category: workoutItem?.category ?? null,
        unit: workoutItem?.unit ?? "kg",
      };
    });
    return [...dayTimeline, ...stoolAsTimeline, ...workoutAsTimeline].sort((a, b) => {
      const byTime = b.updatedAt.localeCompare(a.updatedAt);
      return byTime !== 0 ? byTime : b.key.localeCompare(a.key);
    });
  }, [dayTimeline, stoolEntriesForDate, workoutEntriesForDate, workoutItemIdByName, workoutItemById, effective.diary, date]);

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

  function toggleStoolDetails(id: string) {
    setExpandedStoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshAfterWrite() {
    await loadSnapshot();
    await refresh();
  }

  /** A barely-there tick when a tap registers a log — logging is a
   * dozens-a-day action and the visual state change alone doesn't read as
   * confirmation. No-ops on iOS (Apple doesn't expose the Vibration API)
   * and anywhere else it's unsupported. */
  function logHaptic() {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(8);
  }

  /** Applies the currently-selected Time (see `logTime` state) to a
   * just-created/updated log, so a tap actually gets timestamped as
   * whatever time was picked rather than always "right now" — same idea
   * as Stool's own time field, just applied after the fact since tap-to-
   * log has no separate "commit" step to attach a time to up front. A
   * no-op when there's nothing to correct (a decrement/removal, or the
   * picked time already matches). */
  async function applyLogTime(log: RawLog | null) {
    if (!log) return;
    const iso = combineDateAndTime(date, logTime);
    if (log.updatedAt !== iso) await updateLogTimeAndSync(log.identity, iso);
  }

  async function handleIncrement(candidate: LogCandidate) {
    if (isDemoData) return;
    setPending(candidate.key);
    const log = await incrementDailyLogAndSync(candidate.itemIdentity, candidate.itemType, date, tabConfig?.countable ? meal : null);
    await applyLogTime(log);
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
    const { added } = await toggleDailyLogAndSync(candidate.itemIdentity, candidate.itemType, date);
    await applyLogTime(added);
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
    const log = await setDailyDurationAndSync(candidate.itemIdentity, candidate.itemType, date, totalMinutes);
    await applyLogTime(log);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Tap a band to set the day's value (one log per item per day, upserted);
   * tap the band that's already active to clear it — same toggle-off feel as
   * a plain chip. `value` is the band midpoint in minutes. */
  async function handleSetBand(candidate: LogCandidate, value: number, isActive: boolean) {
    if (isDemoData) return;
    logHaptic();
    setPending(candidate.key);
    if (isActive) {
      await toggleDailyLogAndSync(candidate.itemIdentity, candidate.itemType, date);
    } else {
      const log = await setDailyDurationAndSync(candidate.itemIdentity, candidate.itemType, date, value);
      await applyLogTime(log);
    }
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
    if (entry.itemType === "workout") {
      await deleteWorkoutLogAndSync(entry.key);
      await refreshAfterWrite();
      setPending(null);
      return;
    }
    await deleteLogByIdAndSync(entry.key, entry.itemType);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Corrects the meal/time-of-day tag on an already-logged entry, e.g.
   * something typed as Lunch that was actually Dinner. Food and
   * Supplements only — the timeline only ever offers this control for
   * those two entry types (see hasMealTag below). */
  async function handleChangeEntryMeal(entry: TimelineEntry, mealTag: string) {
    if (isDemoData || entry.itemType === "stool") return;
    setPending(entry.key);
    await updateLogMealTagAndSync(entry.key, mealTag);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Corrects when an entry actually happened — available everywhere in the
   * timeline, food/supplement/habit/symptom, Stool, and Workout alike. */
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
    if (entry.itemType === "workout") {
      // No dedicated updateWorkoutLogTimeAndSync — workout_logs has no generic
      // *_logs shape to reuse (see RawWorkoutLog's own comment), so this just
      // re-puts the existing row with a new `updatedAt`, the same write
      // handleUpdateWorkoutEntry already does for every other field.
      const existing = effective.workoutLogs.find((g) => g.id === entry.key);
      if (existing) await putWorkoutLogAndSync({ ...existing, updatedAt: new Date(iso).getTime() });
      await refreshAfterWrite();
      setPending(null);
      return;
    }
    await updateLogTimeAndSync(entry.key, iso);
    await refreshAfterWrite();
    setPending(null);
  }

  /** Corrects a logged set's value (weight/duration/reps, depending on the
   * exercise's unit) in place — Workout only, from the day timeline. */
  async function handleChangeEntryValue(entry: TimelineEntry, value: number) {
    if (isDemoData || entry.itemType !== "workout") return;
    setPending(entry.key);
    const existing = effective.workoutLogs.find((g) => g.id === entry.key);
    if (existing) await putWorkoutLogAndSync({ ...existing, weightKg: value });
    await refreshAfterWrite();
    setPending(null);
  }

  /** Optional context for one item on one day — structured data first, this
   * is just a short note attached to it, never a required field. Stool has
   * no diary row of its own (no item/category to key one by); its note
   * lives directly on the stool_logs row, so this branches into a plain
   * upsert of that row instead of the shared diary table. */
  async function handleSaveNote(entry: TimelineEntry, content: string) {
    if (isDemoData) return;
    setPending(`note:${entry.itemIdentity}`);
    if (entry.itemType === "stool") {
      const existing = effective.stoolLogs.find((s) => s.id === entry.itemIdentity);
      if (existing) await putStoolLogAndSync({ ...existing, note: content.trim() || null, updatedAt: new Date().toISOString() });
    } else {
      await setDiaryNoteAndSync(entry.itemIdentity, entry.itemType, date, content.trim() || null);
    }
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
    const categoryId = await ensureCategoryId(tabConfig.type, category);
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: tabConfig.type,
      rawName: name,
      category,
      categoryId,
      isArchived: false,
      createdDate: date,
      reminderTime: null,
      unit: null,
    };
    await putItemAndSync(item);
    if (tabConfig.countable) {
      await applyLogTime(await incrementDailyLogAndSync(item.identity, item.itemType, date, meal));
    } else {
      const { added } = await toggleDailyLogAndSync(item.identity, item.itemType, date);
      await applyLogTime(added);
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
    const categoryId = await ensureCategoryId("food", category);
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: "food",
      rawName: itemName,
      category,
      categoryId,
      isArchived: false,
      createdDate: date,
      reminderTime: null,
      unit: null,
    };
    await putItemAndSync(item);
    await applyLogTime(await incrementDailyLogAndSync(item.identity, "food", date, meal));
    await refreshAfterWrite();
    setPending(null);
  }

  function toggleCategoryCollapsed(category: string) {
    if (!tabConfig) return;
    const key = categoryStorageKey(tabConfig.type, category);
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(COLLAPSED_CATEGORIES_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Storage unavailable (private browsing, quota) — collapse still
        // works for this session, it just won't persist.
      }
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
    logHaptic();
    const action = decideChipTapAction(c, mealCounts.get(c.key) ?? 0, Boolean(tabConfig?.countable));
    switch (action) {
      case "create":
        void handleQuickLogCatalog(c);
        break;
      case "increment":
        void handleIncrement(c);
        break;
      case "decrement":
        void handleDecrement(c);
        break;
      case "toggle":
        void handleToggle(c);
        break;
    }
  }

  function stoolLogFromDraft(id: string, entry: NewStoolEntry): RawStoolLog {
    return {
      id,
      date,
      loggedAt: combineDateAndTime(date, entry.loggedAtTime),
      bristolScores: entry.bristolScores,
      color: entry.color,
      floatation: entry.floatation,
      isSticky: entry.isSticky,
      isSmelly: entry.isSmelly,
      isStraining: entry.isStraining,
      hygiene: entry.hygiene,
      symptoms: entry.symptoms,
      timeOnToiletMinutes: entry.timeOnToiletMinutes,
      note: entry.note,
      updatedAt: new Date().toISOString(),
    };
  }

  async function handleSaveStoolEntry(entry: NewStoolEntry) {
    if (isDemoData) return;
    logHaptic();
    const log = stoolLogFromDraft(createTimeOrderedId(), entry);
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

  async function handleSaveWorkoutEntry(entry: NewWorkoutEntry) {
    if (isDemoData) return;
    logHaptic();
    const log: RawWorkoutLog = {
      id: createTimeOrderedId(),
      date,
      exercise: entry.exercise,
      weightKg: Number(entry.weightKg),
      updatedAt: new Date(combineDateAndTime(date, entry.time)).getTime(),
    };
    await putWorkoutLogAndSync(log);
    await refreshAfterWrite();
  }

  /** Reuses the given date's existing period_logs id when one already
   * exists (an edit), or mints a fresh one (a new period day) — the same
   * division of labor putPeriodLogAndSync's own doc comment describes. */
  async function handleSetPeriodDay(forDate: string, intensity: PeriodIntensity, collectionMethods: CollectionMethod[]) {
    if (isDemoData) return;
    logHaptic();
    const existing = effective.periodLogs.find((p) => p.date === forDate);
    const log: RawPeriodLog = {
      id: existing?.id ?? crypto.randomUUID(),
      date: forDate,
      intensity,
      collectionMethods,
      updatedAt: Date.now(),
    };
    await putPeriodLogAndSync(log);
    await refreshAfterWrite();
  }

  async function handleClearPeriodDay(forDate: string) {
    if (isDemoData) return;
    const existing = effective.periodLogs.find((p) => p.date === forDate);
    if (!existing) return;
    await deletePeriodLogAndSync(existing.id);
    await refreshAfterWrite();
  }

  /** A plain list row, not a pill — available items are just text; a
   * tracked one gets a tinted background, a colored left edge, and a
   * checkmark, which reads as "the strongest state on the row" without
   * needing a heavy rounded shape to do it. */
  function renderChip(c: LogCandidate) {
    const logged = (mealCounts.get(c.key) ?? 0) > 0;
    const busy = pending === c.key;
    // One "logged" colour for every food, regardless of category — a green
    // tick reads as "done", where a category hue (rose for Grains, etc.)
    // read as a status. Category colour stays on the group header only.
    const accent = TYPE_ACCENT.food;

    return (
      <button
        key={c.key}
        type="button"
        onClick={() => handleChipTap(c)}
        disabled={busy}
        className={clsx(
          "flex items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-50",
          !logged && "hover:bg-[var(--page-plane)]",
        )}
        style={{
          background: logged ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
          borderLeft: `2px solid ${logged ? accent : "transparent"}`,
          color: logged ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: 400,
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

  // --- Habits / Supplements / Symptoms: full-width rows grouped into the
  //     same white category cards Food uses, with Food's own logged look
  //     (accent tick + tint + left bar). Sleep gets range buckets on its
  //     row, supplements a dose count, a present symptom a 1/2/3 selector.

  /** Food's logged-chip look, reused for a whole row. */
  function trackRowStyle(active: boolean, accent: string) {
    return {
      background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
      borderLeft: `2px solid ${active ? accent : "transparent"}`,
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
    } as const;
  }

  /** Fixed-width state marker at the head of every tracker row — a tick for
   * a logged habit/supplement, the intensity digit for a present symptom —
   * so item names line up regardless of state or length. */
  function RowMark({ children, accent }: { children?: ReactNode; accent: string }) {
    return (
      <span className="w-3 shrink-0 text-center text-xs font-bold leading-none tabular-nums" style={{ color: accent }}>
        {children}
      </span>
    );
  }

  /** The intensity to show for a symptom right now — the optimistic target
   * while taps are still settling, otherwise whatever's actually logged. */
  function symptomDisplayValue(identity: string): number | null {
    return symptomTargets.has(identity)
      ? (symptomTargets.get(identity) ?? null)
      : (durationValueForDate.get(identity) ?? null);
  }

  function setSymptomTarget(id: string, value: number | null) {
    const next = new Map(symptomTargetsRef.current).set(id, value);
    symptomTargetsRef.current = next;
    setSymptomTargets(next);
  }

  function clearSymptomTarget(id: string) {
    const next = new Map(symptomTargetsRef.current);
    next.delete(id);
    symptomTargetsRef.current = next;
    setSymptomTargets(next);
  }

  /** Symptom tap cycles absent → 1 → 2 → 3 → absent. The display updates on
   * every tap; the actual write is debounced so a burst of taps commits
   * once, as the value the user landed on. */
  function cycleSymptom(c: LogCandidate) {
    if (isDemoData) return;
    logHaptic();
    const id = c.itemIdentity;
    const cur = symptomTargetsRef.current.has(id)
      ? (symptomTargetsRef.current.get(id) ?? null)
      : (durationValueForDate.get(id) ?? null);
    const next = cur == null ? 1 : cur >= 3 ? null : cur + 1;
    setSymptomTarget(id, next);

    const running = symptomTimers.current.get(id);
    if (running) clearTimeout(running);
    symptomTimers.current.set(
      id,
      setTimeout(() => {
        symptomTimers.current.delete(id);
        void commitSymptom(c);
      }, 500),
    );
  }

  async function commitSymptom(c: LogCandidate) {
    const id = c.itemIdentity;
    const target = symptomTargetsRef.current.get(id) ?? null;
    // No write has happened yet during this tap burst, so `durationValueForDate`
    // still reflects the true persisted state before the taps.
    const wasLogged = durationValueForDate.get(id) != null;
    setPending(c.key);
    try {
      if (target == null) {
        // Only clear an existing row — toggleDailyLog would otherwise
        // create one when nothing is there.
        if (wasLogged) await toggleDailyLogAndSync(c.itemIdentity, c.itemType, date);
      } else {
        const log = await setDailyDurationAndSync(c.itemIdentity, c.itemType, date, target);
        await applyLogTime(log);
      }
      await refreshAfterWrite();
    } finally {
      clearSymptomTarget(id);
      setPending(null);
    }
  }

  /** A "roughly how much" measure (Sleep) — lives in its own Measures
   * section rather than mixed into the tap-to-log category cards. Name on
   * the left, a compact segmented control on the right: full-width on
   * mobile, natural width on desktop. One tap sets it; tapping the active
   * band clears it. */
  function renderMeasureRow(c: LogCandidate, accent: string) {
    if (INPUT_KIND[c.item] === "duration") return renderDurationRow(c, accent);
    const current = durationValueForDate.get(c.itemIdentity);
    const bands = BAND_OPTIONS[c.item] ?? [];
    const active = activeBandValue(c.item, current);
    const busy = pending === c.key;
    return (
      <li
        key={c.key}
        className="flex flex-col gap-1.5 py-2 pl-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        style={{ borderLeft: `2px solid ${current != null ? accent : "transparent"}`, opacity: busy ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-1.5 text-xs">
          <RowMark accent={accent}>{current != null ? "✓" : null}</RowMark>
          <span style={{ fontWeight: current != null ? 500 : 400, color: current != null ? "var(--text-primary)" : "var(--text-secondary)" }}>
            {c.item}
          </span>
        </div>
        <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--border-hairline)" }}>
          {bands.map((o, i) => {
            const isActive = active === o.value;
            return (
              <button
                key={o.label}
                type="button"
                disabled={busy}
                onClick={() => void handleSetBand(c, o.value, isActive)}
                aria-pressed={isActive}
                className="flex-1 px-2.5 py-1.5 text-center text-xs font-medium transition-colors disabled:opacity-50 sm:flex-none"
                style={{
                  background: isActive ? `color-mix(in oklab, ${accent} 16%, var(--surface-1))` : "transparent",
                  color: isActive ? accent : "var(--text-secondary)",
                  borderLeft: i === 0 ? "none" : "0.5px solid var(--border-hairline)",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </li>
    );
  }

  /** A measured habit — the name plus an exact hours+minutes stepper,
   * defaulting to a sensible anchor until it's set. Kept for a future
   * genuinely-quantitative item; nothing uses "duration" right now. */
  function renderDurationRow(c: LogCandidate, accent: string) {
    const current = durationValueForDate.get(c.itemIdentity);
    const busy = pending === c.key;
    return (
      <li
        key={c.key}
        className="col-span-full flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1 text-xs"
        style={{ ...trackRowStyle(current != null, accent), opacity: busy ? 0.6 : 1 }}
      >
        <RowMark accent={accent}>{current != null ? "✓" : null}</RowMark>
        <span className="mr-1 flex-1" style={{ fontWeight: current != null ? 500 : 400 }}>
          {c.item}
        </span>
        <DurationStepper totalMinutes={current ?? DURATION_DEFAULT_MINUTES[c.item] ?? 0} onChange={(m) => void handleSetDuration(c, m)} />
      </li>
    );
  }

  /** A plain tracked item — Habits, and Supplements (a supplement tap logs
   * it for the time of day selected above; the M/A/N split is the "which
   * dose", so the row itself is just a toggle, no per-row counter). */
  function renderHabitRow(c: LogCandidate, accent: string) {
    // Measures (Sleep's bands, a duration stepper) normally render in their
    // own section — this fallthrough only matters if one is ever shown
    // inside a category card directly.
    if (INPUT_KIND[c.item]) return renderMeasureRow(c, accent);
    const logged = (mealCounts.get(c.key) ?? 0) > 0;
    const busy = pending === c.key;
    return (
      <li key={c.key}>
        <button
          type="button"
          onClick={() => handleChipTap(c)}
          disabled={busy}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors disabled:opacity-50"
          style={trackRowStyle(logged, accent)}
        >
          <RowMark accent={accent}>{logged ? "✓" : null}</RowMark>
          <span className="min-w-0 flex-1 truncate" style={{ fontWeight: logged ? 500 : 400 }}>
            {c.item}
          </span>
        </button>
      </li>
    );
  }

  /** Symptoms: one tap marks it at intensity 1; each further tap raises it
   * (2, 3); a tap past 3 clears it. The level shows as a small digit in the
   * shared left-hand marker slot, so names stay aligned. */
  function renderSymptomRow(c: LogCandidate, accent: string) {
    const current = symptomDisplayValue(c.itemIdentity);
    const present = current != null;
    const busy = pending === c.key;
    return (
      <li key={c.key}>
        <button
          type="button"
          onClick={() => cycleSymptom(c)}
          aria-label={present ? `${c.item}, intensity ${current} of 3 — tap to change` : `Mark ${c.item}`}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors"
          style={{ ...trackRowStyle(present, accent), opacity: busy ? 0.6 : 1 }}
        >
          <RowMark accent={accent}>{present ? current : null}</RowMark>
          <span className="min-w-0 flex-1 truncate" style={{ fontWeight: present ? 500 : 400 }}>
            {c.item}
          </span>
        </button>
      </li>
    );
  }

  function renderTrackerList() {
    if (!tabConfig) return null;
    const accent = TYPE_ACCENT[tabConfig.type];
    const isMeasure = (c: LogCandidate) => Boolean(INPUT_KIND[c.item]);
    const measureItems = groupedByCategory.flatMap((g) => g.items.filter(isMeasure));
    const plainGroups = groupedByCategory
      .map((g) => ({ category: g.category, items: g.items.filter((c) => !isMeasure(c)) }))
      .filter((g) => g.items.length > 0);
    return (
      <div className="flex flex-col gap-3">
        {plainGroups.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {plainGroups.map((group) => (
              <div
                key={group.category}
                className="flex flex-col gap-1 rounded-lg border p-2.5"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
              >
                <div className="mb-0.5 flex items-center gap-1.5 border-b pb-1.5 text-xs font-semibold" style={{ color: accent, borderColor: "var(--border-hairline)" }}>
                  {group.category}
                  <span className="ml-auto font-medium" style={{ color: "var(--text-secondary)" }}>
                    {group.items.length}
                  </span>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {group.items.map((c) =>
                    tab === "outcome" ? renderSymptomRow(c, accent) : renderHabitRow(c, accent),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
        {measureItems.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border p-2.5" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            <div className="mb-0.5 flex items-center gap-1.5 border-b pb-1.5 text-xs font-semibold" style={{ color: accent, borderColor: "var(--border-hairline)" }}>
              Measures
              <span className="ml-auto font-medium" style={{ color: "var(--text-secondary)" }}>
                {measureItems.length}
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-[color:var(--gridline)]">{measureItems.map((c) => renderMeasureRow(c, accent))}</ul>
          </div>
        )}
      </div>
    );
  }

  // The Time field is neutral while it reads roughly "now", and only picks
  // up a tinted border once it's been set to a different day or a time more
  // than a few minutes off — a quiet "you're logging this for earlier",
  // not a permanent focal point.
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const [logHrs, logMins] = logTime.split(":").map(Number);
  const timeIsExplicit = date !== today || Math.abs((logHrs || 0) * 60 + (logMins || 0) - nowMinutes) > 5;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div
          className="min-w-0 flex-1 border-l-[3px] pl-2.5"
          style={{ borderColor: activeLogTab ? activeLogTab.accent : "var(--baseline)" }}
        >
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {activeLogTab ? activeLogTab.label : "Log"}
          </h1>
          {isDemoData && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Example data — sign in or log something real to replace it.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            <button
              type="button"
              onClick={() => setDate((d) => addDaysLocal(d, -1))}
              className="flex h-9 w-9 items-center justify-center rounded text-base font-medium"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Previous day"
            >
              ‹
            </button>
            <label className="relative flex min-w-24 cursor-pointer items-center justify-center rounded px-1.5 py-1.5">
              <span className="text-sm font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                {formatDateLabel(date, today)}
              </span>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                aria-label="Pick a date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={() => setDate((d) => (d < today ? addDaysLocal(d, 1) : d))}
              disabled={date >= today}
              className="flex h-9 w-9 items-center justify-center rounded text-base font-medium disabled:opacity-30"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Next day"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        {/* An underlined menu, not pills — deliberately a different shape
         * from "Eaten at" below so the two rows read as different kinds of
         * control: this one switches the whole page's content (primary
         * navigation), that one just tags optional metadata on a food. On a
         * narrow screen the search box drops to its own line below. */}
        <TabRail
          items={logTabs.map((t) => ({ id: t.id, label: t.label, icon: TAB_ICON[t.id], accent: t.accent }))}
          activeId={tab}
          onSelect={selectTab}
          className="w-full min-w-0 sm:flex-1"
        />
        <div className="flex w-full items-center gap-3 sm:w-auto">
          {tabConfig && (
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={`Search ${tabConfig.label.toLowerCase()}…`}
              className="w-full sm:w-48"
            />
          )}
        </div>
      </div>

      {tab === "stool" || tab === "workout" || tab === "cycle" ? (
        !dataReady ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading…
          </p>
        ) : tab === "stool" ? (
          <StoolTab
            entries={stoolEntriesForDate}
            isDemoData={isDemoData}
            pending={pending}
            accent={STOOL_ACCENT}
            onSave={handleSaveStoolEntry}
            onUpdate={handleUpdateStoolEntry}
            onDelete={handleDeleteStoolEntry}
          />
        ) : tab === "workout" ? (
          <WorkoutTab
            groups={workoutGroupedByCategory}
            entries={workoutEntriesForDate}
            lastValues={workoutLastWeights}
            isDemoData={isDemoData}
            accent={WORKOUT_ACCENT}
            time={workoutTime}
            onTimeChange={setWorkoutTime}
            onSave={handleSaveWorkoutEntry}
          />
        ) : (
          <CycleTab
            periodLogs={effective.periodLogs}
            date={date}
            today={today}
            isDemoData={isDemoData}
            accent={CYCLE_ACCENT}
            onSetDay={handleSetPeriodDay}
            onClearDay={handleClearPeriodDay}
            onNavigateToDate={setDate}
          />
        )
      ) : (
        <>
          {tab === "food" && dataReady && seasonalPicks.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              <button
                type="button"
                onClick={() => setPicksOpen((v) => !v)}
                className="flex items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {monthName} picks
                  <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>
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

          {tabConfig && (
            <div className="flex flex-wrap items-center gap-3">
              {showTimeField || timeIsExplicit ? (
                <label className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Time
                  </span>
                  <input
                    type="time"
                    value={logTime}
                    autoFocus={showTimeField && !timeIsExplicit}
                    onChange={(e) => setLogTime(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className="h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors"
                    style={{
                      borderColor: timeIsExplicit ? "var(--series-2)" : "var(--border-hairline)",
                      background: "var(--surface-1)",
                      color: "var(--text-primary)",
                    }}
                  />
                  {!timeIsExplicit && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogTime(defaultLogTimeValue());
                        setShowTimeField(false);
                      }}
                      className="text-xs underline decoration-dotted"
                      style={{ color: "var(--text-muted)" }}
                    >
                      now
                    </button>
                  )}
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTimeField(true)}
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Time: <span style={{ color: "var(--text-secondary)" }}>now</span>
                  <span className="ml-1 underline decoration-dotted">change</span>
                </button>
              )}
              {tabConfig?.countable && (
                <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                  {tagOptionsForType(tab).map((m) => {
                    const active = m === meal;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMeal(m)}
                        aria-pressed={active}
                        className="rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors"
                        style={{
                          background: active ? `color-mix(in oklab, ${TYPE_ACCENT[tabConfig.type]} 16%, var(--surface-1))` : "transparent",
                          color: active ? TYPE_ACCENT[tabConfig.type] : "var(--text-secondary)",
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              )}
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
                  <span style={{ color: TYPE_ACCENT[tabConfig.type] }}>✓</span>
                  {tab === "outcome"
                    ? ` marked for ${formatDateLabel(date, today).toLowerCase()} — tap to raise intensity, or clear`
                    : ` logged ${tabConfig.countable ? `for ${meal.toLowerCase()}` : formatDateLabel(date, today).toLowerCase()} — tap again to remove`}
                </p>
              )}

              {!addingNew ? (
                <button
                  type="button"
                  onClick={() => (isDemoData ? openPanel() : setAddingNew(true))}
                  className="self-start rounded-md border border-dashed px-2.5 py-1 text-xs font-medium whitespace-nowrap"
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
                      className="rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-white disabled:opacity-40"
                      style={{ background: TYPE_ACCENT[tabConfig.type] }}
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

              {tab === "food" && frequentFoods.length >= 3 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    Your usual
                  </p>
                  <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {frequentFoods.map((c) => {
                      const cAccent = TYPE_ACCENT.food;
                      const logged = (mealCounts.get(c.key) ?? 0) > 0;
                      const busy = pending === c.key;
                      return (
                        <button
                          key={`freq-${c.key}`}
                          type="button"
                          onClick={() => handleChipTap(c)}
                          disabled={busy}
                          className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
                          style={{
                            background: logged ? `color-mix(in oklab, ${cAccent} 12%, var(--surface-1))` : "var(--surface-1)",
                            borderColor: logged ? cAccent : "var(--border-hairline)",
                            color: logged ? cAccent : "var(--text-secondary)",
                          }}
                        >
                          {logged && <span aria-hidden="true">✓</span>}
                          {c.item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === "food" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedByCategory.map((group) => {
                    const accent = colorForCategorySlot(group.category);
                    const icon = FOOD_CATEGORY_ICON[group.category];
                    const items = group.items;
                    if (items.length === 0) return null;
                    // Collapse only actually hides anything on mobile — desktop
                    // always shows every category expanded (see the `lg:`
                    // overrides below), regardless of this saved state.
                    const collapsed = collapsedCategories.has(categoryStorageKey(tabConfig.type, group.category));
                    return (
                      <div key={group.category} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                        <button
                          type="button"
                          onClick={() => toggleCategoryCollapsed(group.category)}
                          className="flex items-center gap-1.5 border-b pb-2 text-left text-xs font-semibold"
                          style={{ color: accent, borderColor: "var(--border-hairline)" }}
                        >
                          {icon}
                          {group.category}
                          <span className="ml-auto flex items-center gap-1 font-medium" style={{ color: "var(--text-secondary)" }}>
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
                              className="lg:hidden"
                              style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }}
                            >
                              <path d="M5 7.5 10 12.5 15 7.5" />
                            </svg>
                          </span>
                        </button>
                        <div
                          className={clsx(
                            // Flows top-to-bottom within each column (CSS
                            // multi-column) so the A–Z sort reads down each
                            // column, not across. Collapse hides this on
                            // mobile only — `lg:` always shows it.
                            "columns-[110px] gap-x-2 [&>*]:mb-0.5 [&>*]:break-inside-avoid-column",
                            collapsed ? "hidden lg:block" : "block",
                          )}
                        >
                          {items.map((c) => renderChip(c))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                renderTrackerList()
              )}

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
          <h2 className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Timeline — {formatDateLabel(date, today).toLowerCase()}
          </h2>
          {/* Horizontal card strip. Every card is the same width and — via
           * `items-stretch` — the same height, so time / name / tag / note
           * line up across the row. A right-edge fade (see useOverflowFade)
           * shows when there's more to scroll to. */}
          <div ref={timelineRef} className="no-scrollbar fade-x overflow-x-auto pb-2">
            <div className="flex min-w-max items-stretch gap-3">
              {combinedTimeline.map((entry, i) => {
                const busy = pending === entry.key;
                const hasMealTag = (entry.itemType === "food" || entry.itemType === "supplement") && (entry.mealTag || !isDemoData);
                const hasNote = !isDemoData || entry.note;
                const accent = entry.itemType === "stool" ? STOOL_ACCENT : TYPE_ACCENT[entry.itemType];
                return (
                  <div
                    key={entry.key}
                    className="relative flex w-36 shrink-0 flex-col gap-1 rounded-lg border p-2"
                    style={{ opacity: busy ? 0.5 : 1, borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
                  >
                    <span
                      className="absolute top-[10px] left-2 z-10 h-2.5 w-2.5 shrink-0 rounded-full border-2"
                      style={{ borderColor: accent, background: "var(--surface-1)" }}
                    />
                    {i < combinedTimeline.length - 1 && (
                      <span className="absolute top-[15px] -right-3 h-px w-3" style={{ background: "var(--border-hairline)" }} />
                    )}
                    {/* Top row, same position on every card: time on the
                     * left (indented past the dot), delete at top-right. */}
                    <div className="flex w-full items-start justify-between gap-1 pl-3">
                      {isDemoData ? (
                        <span className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {entry.time}
                        </span>
                      ) : (
                        <input
                          type="time"
                          value={toTimeInputValue(entry.updatedAt)}
                          disabled={busy}
                          onChange={(e) => void handleChangeEntryTime(entry, e.target.value)}
                          onClick={(e) => e.currentTarget.showPicker?.()}
                          aria-label={`Change time for ${entry.item}`}
                          className="w-[84px] min-w-0 rounded px-0.5 py-0.5 font-mono text-xs whitespace-nowrap outline-none disabled:opacity-40"
                          style={{ background: "transparent", color: "var(--text-muted)", border: "none" }}
                        />
                      )}
                      {!isDemoData && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteEntry(entry)}
                          disabled={busy}
                          aria-label={`Delete ${entry.item} at ${entry.time}`}
                          className="shrink-0 text-xs leading-none disabled:opacity-40"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Item name, directly below time — same position on
                     * every card, capped at two lines so a long name can't
                     * push the rest of the card's layout around. */}
                    <span className="line-clamp-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      {entry.item}
                      {entry.value != null && (() => {
                        const suffix =
                          INPUT_KIND[entry.item] === "band"
                            ? bandLabelForValue(entry.item, entry.value)
                            : INPUT_KIND[entry.item] === "duration"
                              ? formatMinutes(entry.value)
                              : entry.itemType === "outcome" && entry.value >= 1
                                ? `intensity ${entry.value}`
                                : null;
                        return suffix ? (
                          <span className="ml-1 font-normal" style={{ color: "var(--text-secondary)" }}>
                            {suffix}
                          </span>
                        ) : null;
                      })()}
                    </span>

                    {/* Category pill, directly below the name — Workout's
                     * equivalent of Food's meal-tag pill below. Read-only
                     * (recategorizing here would mean recategorizing the
                     * exercise itself, not just this one entry — that's a
                     * Manage-page action, not a timeline one). */}
                    {entry.itemType === "workout" && entry.category && (
                      <span
                        className="self-start rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
                        style={{ background: `color-mix(in oklab, ${accent} 14%, var(--surface-1))`, color: accent }}
                      >
                        {entry.category}
                      </span>
                    )}

                    {/* Meal/time-of-day selector, directly below the name
                     * when it applies — absent for anything that isn't
                     * Food or Supplements. */}
                    {hasMealTag &&
                      (isDemoData ? (
                        entry.mealTag && (
                          <span
                            className="self-start rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
                            style={{ background: "color-mix(in oklab, var(--series-2) 14%, var(--surface-1))", color: "var(--series-2)" }}
                          >
                            {entry.mealTag}
                          </span>
                        )
                      ) : (
                        <select
                          value={entry.mealTag ?? ""}
                          disabled={busy}
                          onChange={(e) => void handleChangeEntryMeal(entry, e.target.value)}
                          className="w-full rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap outline-none disabled:opacity-40"
                          style={{ background: "color-mix(in oklab, var(--series-2) 14%, var(--surface-1))", color: "var(--series-2)", border: "none" }}
                        >
                          <option value="" disabled>
                            {entry.itemType === "supplement" ? "set time" : "set meal"}
                          </option>
                          {tagOptionsForType(entry.itemType).map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      ))}

                    {entry.itemType === "stool" &&
                      (() => {
                        const full = effective.stoolLogs.find((s) => s.id === entry.itemIdentity);
                        if (!full) return null;
                        const labels = characteristicLabels(full);
                        const hasDetails =
                          full.color ||
                          full.floatation ||
                          full.hygiene.length > 0 ||
                          full.symptoms.length > 0 ||
                          full.timeOnToiletMinutes != null ||
                          labels.length > 0;
                        if (!hasDetails) return null;
                        const expanded = expandedStoolIds.has(full.id);
                        return (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => toggleStoolDetails(full.id)}
                              className="self-start text-xs font-medium underline decoration-dotted"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {expanded ? "Hide details" : "More details"}
                            </button>
                            {expanded && (
                              <div className="flex flex-col gap-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                                {full.color && <span>Color: {full.color}</span>}
                                {full.floatation && <span>{full.floatation}</span>}
                                {labels.length > 0 && <span>{labels.join(", ")}</span>}
                                {full.symptoms.length > 0 && <span>{full.symptoms.join(", ")}</span>}
                                {full.hygiene.length > 0 && <span>Hygiene: {full.hygiene.join(", ")}</span>}
                                {full.timeOnToiletMinutes != null && <span>{full.timeOnToiletMinutes}m on toilet</span>}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    {/* Value + unit, its own bottom line — read-only until
                     * Edit is tapped, same reveal-on-click shape as the
                     * note button below. */}
                    {entry.itemType === "workout" && entry.value != null && (
                      <TimelineWorkoutValue
                        value={entry.value}
                        unit={entry.unit ?? "kg"}
                        accent={accent}
                        busy={busy}
                        hidden={isDemoData}
                        onChange={(v) => void handleChangeEntryValue(entry, v)}
                      />
                    )}

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
