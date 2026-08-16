"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { AuthWidget } from "@/components/auth/AuthWidget";
import { pullFromCloud, pushUserOverride, syncHabitDay } from "@/lib/supabase/sync";
import {
  decrementDailyLog,
  getAllHabits,
  getAllEvents,
  getAllUserOverrides,
  incrementDailyLog,
  putHabit,
  setUserOverride,
  toggleDailyLog,
} from "@/lib/db/indexedDb";
import {
  buildLogCandidates,
  generateManualHabitId,
  loggedCountsForDate,
  type LogCandidate,
} from "@/lib/logCandidates";
import { normalizeName } from "@/taxonomy/normalizeName";
import { TYPE_ACCENT, type ItemType } from "@/taxonomy/categories";
import type { OverrideEntry } from "@/taxonomy/classify";
import type { RawEvent, RawHabit } from "@/lib/types";

const TABS: { type: ItemType; label: string; placeholder: string; defaultCategory: string; countable: boolean }[] = [
  { type: "food", label: "Food", placeholder: "Add a food or ingredient…", defaultCategory: "Misc", countable: true },
  { type: "outcome", label: "Symptoms", placeholder: "Add a symptom…", defaultCategory: "Other Symptom", countable: false },
  { type: "supplement", label: "Supplements", placeholder: "Add a supplement…", defaultCategory: "Other", countable: false },
  { type: "habit", label: "Habits", placeholder: "Add a habit…", defaultCategory: "Other", countable: false },
];

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
  habits: RawHabit[];
  events: RawEvent[];
  userOverrides: Record<string, OverrideEntry>;
}

export default function LogPage() {
  const { refresh } = useData();
  const { session } = useAuth();
  const today = useMemo(() => todayLocalISODate(), []);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<ItemType>("food");
  const [query, setQuery] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const [habits, events, userOverrides] = await Promise.all([
      getAllHabits(),
      getAllEvents(),
      getAllUserOverrides(),
    ]);
    setSnapshot({ habits, events, userOverrides });
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

  const candidates = useMemo(() => {
    if (!snapshot) return [];
    return buildLogCandidates(snapshot.habits, snapshot.events, snapshot.userOverrides);
  }, [snapshot]);

  const counts = useMemo(() => {
    if (!snapshot) return new Map<string, number>();
    return loggedCountsForDate(snapshot.habits, snapshot.events, snapshot.userOverrides, date);
  }, [snapshot, date]);

  const tabConfig = TABS.find((t) => t.type === tab)!;
  const tabCandidates = useMemo(() => {
    const inTab = candidates.filter((c) => c.itemType === tab);
    const q = normalizeName(query);
    return q ? inTab.filter((c) => normalizeName(c.item).includes(q)) : inTab;
  }, [candidates, tab, query]);

  const loggedTodayCount = useMemo(
    () => candidates.filter((c) => (counts.get(c.key) ?? 0) > 0).length,
    [candidates, counts],
  );

  async function refreshAfterWrite() {
    await loadSnapshot();
    await refresh();
  }

  async function handleIncrement(candidate: LogCandidate) {
    setPending(candidate.key);
    await incrementDailyLog(candidate.habitIdentity, date);
    await refreshAfterWrite();
    setPending(null);
    void syncHabitDay(candidate.habitIdentity, date);
  }

  async function handleDecrement(candidate: LogCandidate) {
    setPending(candidate.key);
    await decrementDailyLog(candidate.habitIdentity, date);
    await refreshAfterWrite();
    setPending(null);
    void syncHabitDay(candidate.habitIdentity, date);
  }

  async function handleToggle(candidate: LogCandidate) {
    setPending(candidate.key);
    await toggleDailyLog(candidate.habitIdentity, date);
    await refreshAfterWrite();
    setPending(null);
    void syncHabitDay(candidate.habitIdentity, date);
  }

  async function handleAddNew() {
    const name = newItemText.trim();
    if (!name) return;
    const key = normalizeName(name);
    const identity = generateManualHabitId(key);
    const override: OverrideEntry = {
      canonicalName: name,
      itemType: tabConfig.type,
      category: tabConfig.defaultCategory,
      subcategory: tabConfig.defaultCategory,
    };
    setPending("__new__");
    await setUserOverride(key, override);
    await putHabit({
      identity,
      rawName: name,
      unit: null,
      kind: null,
      frequency: null,
      isRemoved: false,
      createdDate: date,
    });
    if (tabConfig.countable) {
      await incrementDailyLog(identity, date);
    } else {
      await toggleDailyLog(identity, date);
    }
    setNewItemText("");
    await refreshAfterWrite();
    setPending(null);
    void pushUserOverride(key, override);
    void syncHabitDay(identity, date);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Log
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {tabConfig.countable
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

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Filter ${tabConfig.label.toLowerCase()}…`}
        className="w-full max-w-xs rounded-md border px-3 py-1.5 text-sm outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />

      {!snapshot ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tabCandidates.map((c) => {
            const count = counts.get(c.key) ?? 0;
            const logged = count > 0;
            const busy = pending === c.key;
            const accent = TYPE_ACCENT[tab];

            if (tabConfig.countable) {
              return (
                <div
                  key={c.key}
                  className="flex items-stretch overflow-hidden rounded-full border text-sm font-medium"
                  style={{
                    borderColor: logged ? accent : "var(--border-hairline)",
                    background: logged ? `color-mix(in oklab, ${accent} 16%, var(--surface-1))` : "var(--surface-1)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleIncrement(c)}
                    disabled={busy}
                    className="px-3.5 py-1.5 disabled:opacity-60"
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
                      className="border-l px-2.5 py-1.5 font-mono text-xs disabled:opacity-60"
                      style={{ borderColor: accent, color: accent }}
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
                className="rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
                style={{
                  borderColor: logged ? accent : "var(--border-hairline)",
                  background: logged ? `color-mix(in oklab, ${accent} 16%, var(--surface-1))` : "var(--surface-1)",
                  color: logged ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {logged && <span style={{ color: accent }}>✓ </span>}
                {c.item}
              </button>
            );
          })}

          {tabCandidates.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {query ? "No matches." : `Nothing tracked here yet — add your first ${tabConfig.label.toLowerCase().replace(/s$/, "")} below.`}
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleAddNew();
        }}
        className="flex items-center gap-2"
      >
        <input
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
          className="rounded-full border px-3.5 py-1.5 text-sm font-medium disabled:opacity-40"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
        >
          + Add &amp; log
        </button>
      </form>
    </div>
  );
}
