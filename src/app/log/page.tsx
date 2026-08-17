"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { pushDiaryEntry, pushUserOverride, syncItemDay } from "@/lib/supabase/sync";
import {
  decrementDailyLog,
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

/** Food-category emoji — a lightweight, zero-asset way to make the
 * highest-frequency tab (tapped many times a day) scannable at a glance.
 * Only food gets these: it's the tab with both the most categories and the
 * most repeat taps, per the redesign this was built for. */
const FOOD_CATEGORY_EMOJI: Record<string, string> = {
  Veggies: "🥦",
  Fruit: "🍓",
  Legumes: "🫘",
  Grains: "🌾",
  Dairy: "🥛",
  "Meat & Fish": "🐟",
  "Nuts & Seeds": "🥜",
  Misc: "🍬",
};

/** A sensible starting point for "what meal is this," always overridable
 * by a click — the point of the selector is that it doesn't have to match
 * the clock (logging breakfast at night should still say Breakfast). */
function defaultMealForNow(): (typeof MEAL_OPTIONS)[number] {
  const hour = new Date().getHours();
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

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
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<ItemType>("food");
  const [addingNew, setAddingNew] = useState(false);
  const [picksOpen, setPicksOpen] = useState(false);
  const [meal, setMeal] = useState<(typeof MEAL_OPTIONS)[number]>(() => defaultMealForNow());
  const [newItemText, setNewItemText] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);

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

  const tabConfig = TABS.find((t) => t.type === tab)!;
  const tabCandidates = useMemo(() => candidates.filter((c) => c.itemType === tab), [candidates, tab]);

  // Grouped in the taxonomy's fixed category order (not by frequency), so a
  // category always sits in the same place and the alphabetical list inside
  // it never reshuffles — the whole point is finding a specific item by eye
  // without typing.
  const groupedByCategory = useMemo(() => {
    const byCategory = new Map<string, LogCandidate[]>();
    for (const c of tabCandidates) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }
    for (const list of byCategory.values()) list.sort((a, b) => a.item.localeCompare(b.item));
    return CATEGORIES_BY_TYPE[tab]
      .map((category) => ({ category, items: byCategory.get(category) ?? [] }))
      .filter((group) => group.items.length > 0);
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
    await decrementDailyLog(candidate.itemIdentity, date);
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
    // bucket) before falling back to the tab's generic default.
    const bundled = classifyItem(name, {});
    const needsOverride = bundled.matchedBy === "fallback";
    const guessedCategory = tabConfig.type === "food" ? lookupFoodCategory(name) : null;
    const category = needsOverride ? (guessedCategory ?? tabConfig.defaultCategory) : bundled.category;

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
    setAddingNew(false);
    await refreshAfterWrite();
    setPending(null);
    void syncItemDay(identity, date);
  }

  /** Suggestion chips log directly — matching an existing item just
   * increments it; a never-tracked seasonal item gets created under a
   * guessed category and logged in the same tap. */
  async function handleQuickLogSeasonal(itemName: string) {
    if (isDemoData) return;
    const norm = normalizeName(itemName);
    const pendingKey = `seasonal:${norm}`;
    const existing = candidates.find((c) => c.itemType === "food" && normalizeName(c.item) === norm);
    if (existing) {
      await handleIncrement(existing);
      return;
    }

    setPending(pendingKey);
    const identity = generateManualItemId(norm);
    const category = lookupFoodCategory(itemName) ?? "Misc";
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

  /** Every chip is a single-tap toggle now — food included. A food can only
   * be logged once per day; tapping a logged food removes that entry
   * instead of stacking another one. */
  function handleChipTap(c: LogCandidate) {
    const logged = (counts.get(c.key) ?? 0) > 0;
    if (tabConfig.countable) {
      void (logged ? handleDecrement(c) : handleIncrement(c));
    } else {
      void handleToggle(c);
    }
  }

  function renderChip(c: LogCandidate, accent: string) {
    const logged = (counts.get(c.key) ?? 0) > 0;
    const busy = pending === c.key;

    return (
      <button
        key={c.key}
        type="button"
        onClick={() => handleChipTap(c)}
        disabled={busy}
        className={clsx(
          "rounded-full border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50",
          !logged && "hover:bg-[var(--page-plane)]",
        )}
        style={{
          borderColor: logged ? accent : "rgba(36, 49, 58, 0.22)",
          background: logged ? `color-mix(in oklab, ${accent} 20%, var(--surface-1))` : "var(--surface-1)",
          color: logged ? "var(--text-primary)" : "var(--text-secondary)",
        }}
      >
        {logged && (
          <span className="mr-0.5" style={{ color: accent }}>
            ✓
          </span>
        )}
        {c.item}
      </button>
    );
  }

  /** Duration-kind items (Sleep duration) render an hours+minutes picker
   * instead of a tap chip — a magnitude, not an occurrence. */
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
        className="flex items-center gap-2 rounded-full border px-2.5 py-1"
        style={{
          borderColor: logged ? accent : "rgba(36, 49, 58, 0.22)",
          background: logged ? `color-mix(in oklab, ${accent} 20%, var(--surface-1))` : "var(--surface-1)",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: logged ? "var(--text-primary)" : "var(--text-secondary)" }}>
          {c.item}
        </span>
        <DurationStepper totalMinutes={minutes} onChange={(m) => void handleSetDuration(c, m)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
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
            style={{
              color: date === today ? "#fff" : "var(--text-primary)",
              background: date === today ? "var(--series-1)" : "transparent",
            }}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex w-fit items-center gap-0.5 rounded-lg p-1" style={{ background: "var(--page-plane)" }}>
          {TABS.map((t) => {
            const active = t.type === tab;
            const count = candidates.filter((c) => c.itemType === t.type).length;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTab(t.type)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  background: active ? "var(--surface-1)" : "transparent",
                  color: active ? TYPE_ACCENT[t.type] : "var(--text-secondary)",
                  boxShadow: active ? "var(--shadow-card)" : "none",
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: active ? TYPE_ACCENT[t.type] : "var(--text-muted)", opacity: active ? 0.75 : 1 }}
                  >
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

      {tabConfig.countable && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
            Eaten at
          </span>
          <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: "var(--page-plane)" }}>
            {MEAL_OPTIONS.map((m) => {
              const active = m === meal;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMeal(m)}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors"
                  style={{
                    color: active ? "#fff" : "var(--text-secondary)",
                    background: active ? TYPE_ACCENT.food : "transparent",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                    className="rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap disabled:opacity-50"
                    style={{ borderColor: "rgba(36, 49, 58, 0.22)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
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

      {!dataReady ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groupedByCategory.map((group) => {
              const accent = tab === "food" ? colorForCategorySlot(group.category) : TYPE_ACCENT[tab];
              const emoji = tab === "food" ? FOOD_CATEGORY_EMOJI[group.category] : null;
              return (
                <div
                  key={group.category}
                  className="flex flex-col gap-1.5 rounded-xl border p-2.5"
                  style={{ borderColor: "var(--border-hairline)", background: `color-mix(in oklab, ${accent} 7%, var(--surface-1))` }}
                >
                  <h2 className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase" style={{ color: accent }}>
                    {emoji && <span className="text-sm">{emoji}</span>}
                    {group.category}
                    <span className="font-medium normal-case" style={{ color: "var(--text-secondary)" }}>
                      · {group.items.length}
                    </span>
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((c) => (INPUT_KIND[c.item] === "duration" ? renderDurationControl(c, accent) : renderChip(c, accent)))}
                  </div>
                </div>
              );
            })}
          </div>

          {groupedByCategory.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Nothing tracked here yet — add your first {tabConfig.label.toLowerCase().replace(/s$/, "")} below.
            </p>
          )}

          {isDemoData ? null : !addingNew ? (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="self-start rounded-full border border-dashed px-3 py-1.5 text-sm font-medium whitespace-nowrap"
              style={{ borderColor: "rgba(36, 49, 58, 0.28)", color: "var(--text-secondary)" }}
            >
              + Something not listed
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAddNew();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder={tabConfig.placeholder}
                className="w-full max-w-xs rounded-full border px-3.5 py-1.5 text-sm outline-none"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              />
              <button
                type="submit"
                disabled={!newItemText.trim() || pending === "__new__"}
                className="rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap disabled:opacity-40"
                style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
              >
                + Add &amp; log
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingNew(false);
                  setNewItemText("");
                }}
                className="text-sm font-medium underline decoration-dotted"
                style={{ color: "var(--text-secondary)" }}
              >
                cancel
              </button>
            </form>
          )}

          {dayTimeline.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border-hairline)" }}>
              <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
                Timeline — {formatDateLabel(date, today).toLowerCase()}
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dayTimeline.map((entry) => {
                  const busy = pending === entry.key;
                  return (
                    <div
                      key={entry.key}
                      className="flex shrink-0 flex-col gap-1 rounded-lg border px-2.5 py-2"
                      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", opacity: busy ? 0.5 : 1 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT[entry.itemType] }} />
                        <span className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                          {entry.time}
                        </span>
                        {!isDemoData && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteEntry(entry)}
                            disabled={busy}
                            aria-label={`Delete ${entry.item} at ${entry.time}`}
                            className="ml-1 text-xs leading-none disabled:opacity-40"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                        {entry.item}
                        {INPUT_KIND[entry.item] === "duration" && entry.value != null && (
                          <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>
                            {formatMinutes(entry.value)}
                          </span>
                        )}
                      </span>
                      {entry.itemType === "food" &&
                        (isDemoData ? (
                          entry.mealTag && (
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
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
                            className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap outline-none disabled:opacity-40"
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
                        ))}
                      <TimelineNote
                        note={entry.note}
                        busy={pending === `note:${entry.itemIdentity}`}
                        hidden={isDemoData}
                        onSave={(content) => void handleSaveNote(entry, content)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
