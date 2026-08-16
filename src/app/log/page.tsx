"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { AuthWidget } from "@/components/auth/AuthWidget";
import { pullFromCloud, pushUserOverride, syncItemDay } from "@/lib/supabase/sync";
import {
  decrementDailyLog,
  deleteLogById,
  getAllItems,
  getAllLogs,
  getAllUserOverrides,
  incrementDailyLog,
  putItem,
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
import { buildDemoDataset } from "@/lib/demoData";
import { normalizeName } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, TYPE_ACCENT, colorForCategorySlot, type ItemType } from "@/taxonomy/categories";
import { lookupFoodCategory, type OverrideEntry } from "@/taxonomy/classify";
import type { RawLog, RawItem } from "@/lib/types";

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

interface Snapshot {
  items: RawItem[];
  logs: RawLog[];
  userOverrides: Record<string, OverrideEntry>;
}

export default function LogPage() {
  const { refresh, isDemoData } = useData();
  const { session } = useAuth();
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<ItemType>("food");
  const [addingNew, setAddingNew] = useState(false);
  const [picksOpen, setPicksOpen] = useState(false);
  const [meal, setMeal] = useState<(typeof MEAL_OPTIONS)[number]>(() => defaultMealForNow());
  const [newItemText, setNewItemText] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showLocalOnlyNotice, setShowLocalOnlyNotice] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const [items, logs, userOverrides] = await Promise.all([
      getAllItems(),
      getAllLogs(),
      getAllUserOverrides(),
    ]);
    setSnapshot({ items, logs, userOverrides });
  }, []);

  useEffect(() => {
    // Loading from IndexedDB on mount — an external-system read, not a
    // React-state sync loop, so the async setState it triggers is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!session) return;
    // Pulling this device up to date with the cloud right after signing
    // in (or on load, if already signed in) — an external-system read.
    void pullFromCloud().then(() => loadSnapshot());
  }, [session, loadSnapshot]);

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
        ? { items: demo.items, logs: demo.logs, userOverrides: {} }
        : (snapshot ?? { items: [], logs: [], userOverrides: {} }),
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
    () => dayTimelineEntries(effective.items, effective.logs, effective.userOverrides, date),
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
  const weeklyPriority = useMemo(
    () => weeklyCategoryPriority(seasonalCanonical, today),
    [seasonalCanonical, today],
  );
  const leastTrackedCategory = weeklyPriority[0] ?? null;

  async function refreshAfterWrite() {
    await loadSnapshot();
    await refresh();
    if (!session) setShowLocalOnlyNotice(true);
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

  async function handleAddNew() {
    if (isDemoData) return;
    const name = newItemText.trim();
    if (!name) return;
    const key = normalizeName(name);
    const identity = generateManualItemId(key);
    // For food specifically, guess a real category from the name (so a
    // typed "Kohlrabi" lands under Veggies, not a catch-all Misc bucket)
    // before falling back to the tab's generic default.
    const guessedCategory = tabConfig.type === "food" ? lookupFoodCategory(name) : null;
    const category = guessedCategory ?? tabConfig.defaultCategory;
    const override: OverrideEntry = {
      canonicalName: name,
      itemType: tabConfig.type,
      category,
      subcategory: category,
    };
    setPending("__new__");
    await setUserOverride(key, override);
    await putItem({
      identity,
      rawName: name,
      unit: null,
      kind: null,
      frequency: null,
      isRemoved: false,
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
    void pushUserOverride(key, override);
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
      createdDate: date,
    });
    await incrementDailyLog(identity, date, meal);
    await refreshAfterWrite();
    setPending(null);
    void pushUserOverride(norm, override);
    void syncItemDay(identity, date);
  }

  function renderChip(c: LogCandidate, accent: string) {
    const count = counts.get(c.key) ?? 0;
    const logged = count > 0;
    const busy = pending === c.key;

    if (tabConfig.countable) {
      return (
        <div
          key={c.key}
          className="flex items-stretch overflow-hidden rounded-xl border text-sm font-medium shadow-sm"
          style={{
            borderColor: logged ? accent : "var(--border-hairline)",
            background: logged ? `color-mix(in oklab, ${accent} 18%, var(--surface-1))` : "var(--surface-1)",
          }}
        >
          <button
            type="button"
            onClick={() => handleIncrement(c)}
            disabled={busy}
            className="px-4 py-2.5 disabled:opacity-60"
            style={{ color: logged ? "var(--text-primary)" : "var(--text-secondary)" }}
          >
            {c.item}
          </button>
          {logged && (
            <button
              type="button"
              onClick={() => handleDecrement(c)}
              disabled={busy}
              aria-label={`Remove one ${c.item}`}
              className="border-l px-2.5 py-2.5 font-mono text-xs font-semibold disabled:opacity-60"
              style={{ borderColor: `color-mix(in oklab, ${accent} 40%, transparent)`, color: accent }}
            >
              ×{count}
            </button>
          )}
        </div>
      );
    }

    return (
      <button
        key={c.key}
        type="button"
        onClick={() => handleToggle(c)}
        disabled={busy}
        className="rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
        style={{
          borderColor: logged ? accent : "var(--border-hairline)",
          background: logged ? `color-mix(in oklab, ${accent} 18%, var(--surface-1))` : "var(--surface-1)",
          color: logged ? "var(--text-primary)" : "var(--text-secondary)",
        }}
      >
        {logged && <span style={{ color: accent }}>✓ </span>}
        {c.item}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Log
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {isDemoData
              ? "Example data — this is what a tracked day looks like. Sign in or log something for real to replace it."
              : tabConfig.countable
                ? "Click a food each time you eat it — the count goes up. No forms, nothing to submit."
                : "Tap what applies. No forms, nothing to submit — every tap saves straight to this device."}
          </p>
          <div className="mt-1.5">
            <AuthWidget />
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border-hairline)" }}>
          <button
            type="button"
            onClick={() => setDate((d) => addDaysLocal(d, -1))}
            className="rounded-md px-2 py-1 text-sm"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Previous day"
          >
            ‹
          </button>
          <span className="min-w-28 px-1 text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {formatDateLabel(date, today)}
          </span>
          <button
            type="button"
            onClick={() => setDate((d) => (d < today ? addDaysLocal(d, 1) : d))}
            disabled={date >= today}
            className="rounded-md px-2 py-1 text-sm disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      {showLocalOnlyNotice && !session && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm"
          style={{ borderColor: "var(--status-warning)", background: "color-mix(in oklab, var(--status-warning) 14%, var(--surface-1))" }}
        >
          <span style={{ color: "var(--text-primary)" }}>
            Saved on this device only — you&apos;re not signed in, so nothing just synced to the cloud.
          </span>
          <button
            type="button"
            onClick={() => setShowLocalOnlyNotice(false)}
            className="shrink-0 text-xs underline decoration-dotted"
            style={{ color: "var(--text-secondary)" }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-b" style={{ borderColor: "var(--border-hairline)" }}>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = t.type === tab;
            const count = candidates.filter((c) => c.itemType === t.type).length;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setTab(t.type)}
                className="relative px-3 py-2.5 text-sm font-medium transition-colors"
                style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                {t.label}
                {count > 0 && (
                  <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {count}
                  </span>
                )}
                {active && (
                  <span
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                    style={{ background: TYPE_ACCENT[t.type] }}
                  />
                )}
              </button>
            );
          })}
        </nav>
        <span className="hidden shrink-0 text-xs sm:inline" style={{ color: "var(--text-muted)" }}>
          {loggedTodayCount} logged {formatDateLabel(date, today).toLowerCase()}
        </span>
      </div>

      {tabConfig.countable && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Eaten at:
          </span>
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border-hairline)" }}>
            {MEAL_OPTIONS.map((m) => {
              const active = m === meal;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMeal(m)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    background: active ? `color-mix(in oklab, ${TYPE_ACCENT.food} 16%, var(--surface-1))` : "transparent",
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
        <div className="flex flex-col gap-2.5 rounded-lg border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          <button
            type="button"
            onClick={() => setPicksOpen((v) => !v)}
            className="flex items-center justify-between gap-2 text-left"
          >
            <div>
              <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                {monthName} picks
                <span className="ml-1.5 font-normal normal-case" style={{ color: "var(--text-muted)" }}>
                  · {seasonalPicks.length} in season
                </span>
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                In season now around Poland — ranked by how long it&apos;s been, tap to log.
              </p>
            </div>
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
              style={{ color: "var(--text-muted)", transform: picksOpen ? "rotate(180deg)" : "none" }}
            >
              <path d="M5 7.5 10 12.5 15 7.5" />
            </svg>
          </button>
          {picksOpen && (
            <>
              <div className="flex flex-wrap gap-2">
                {seasonalPicks.map((pick) => (
                  <button
                    key={pick.item}
                    type="button"
                    onClick={() => void handleQuickLogSeasonal(pick.item)}
                    disabled={pending === `seasonal:${normalizeName(pick.item)}`}
                    className="rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap disabled:opacity-60"
                    style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
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
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  This week&apos;s priority: <strong style={{ color: "var(--text-primary)" }}>{leastTrackedCategory.category}</strong> — logged{" "}
                  {leastTrackedCategory.countThisWeek} time{leastTrackedCategory.countThisWeek === 1 ? "" : "s"} so far.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {!dataReady ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groupedByCategory.map((group) => {
              const accent = tab === "food" ? colorForCategorySlot(group.category) : TYPE_ACCENT[tab];
              const emoji = tab === "food" ? FOOD_CATEGORY_EMOJI[group.category] : null;
              return (
                <div
                  key={group.category}
                  className="flex flex-col gap-2.5 rounded-2xl border p-3.5"
                  style={{ borderColor: "var(--border-hairline)", background: `color-mix(in oklab, ${accent} 7%, var(--surface-1))` }}
                >
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase" style={{ color: accent }}>
                    {emoji && <span className="text-sm">{emoji}</span>}
                    {group.category}
                    <span className="font-normal normal-case" style={{ color: "var(--text-muted)" }}>
                      · {group.items.length}
                    </span>
                  </h2>
                  <div className="flex flex-wrap gap-2">{group.items.map((c) => renderChip(c, accent))}</div>
                </div>
              );
            })}
          </div>

          {groupedByCategory.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing tracked here yet — add your first {tabConfig.label.toLowerCase().replace(/s$/, "")} below.
            </p>
          )}

          {isDemoData ? null : !addingNew ? (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="self-start rounded-full border border-dashed px-3.5 py-1.5 text-sm whitespace-nowrap"
              style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}
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
                className="text-sm underline decoration-dotted"
                style={{ color: "var(--text-muted)" }}
              >
                cancel
              </button>
            </form>
          )}

          {dayTimeline.length > 0 && (
            <div className="mt-2 flex flex-col gap-2.5 border-t pt-4" style={{ borderColor: "var(--border-hairline)" }}>
              <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Timeline — {formatDateLabel(date, today).toLowerCase()}
              </h2>
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {dayTimeline.map((entry) => {
                  const busy = pending === entry.key;
                  return (
                    <div
                      key={entry.key}
                      className="flex shrink-0 flex-col gap-1.5 rounded-xl border px-3 py-2.5"
                      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", opacity: busy ? 0.5 : 1 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_ACCENT[entry.itemType] }} />
                        <span className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {entry.time}
                        </span>
                        {!isDemoData && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteEntry(entry)}
                            disabled={busy}
                            aria-label={`Delete ${entry.item} at ${entry.time}`}
                            className="ml-1 text-xs leading-none disabled:opacity-40"
                            style={{ color: "var(--text-muted)" }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                        {entry.item}
                      </span>
                      {entry.itemType === "food" &&
                        (isDemoData ? (
                          entry.mealTag && (
                            <span
                              className="rounded-full px-2 py-0.5 text-xs whitespace-nowrap"
                              style={{ background: "var(--page-plane)", color: "var(--text-muted)" }}
                            >
                              {entry.mealTag}
                            </span>
                          )
                        ) : (
                          <select
                            value={entry.mealTag ?? ""}
                            disabled={busy}
                            onChange={(e) => void handleChangeEntryMeal(entry, e.target.value)}
                            className="rounded-full px-2 py-0.5 text-xs whitespace-nowrap outline-none disabled:opacity-40"
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
