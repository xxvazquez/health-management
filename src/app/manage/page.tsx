"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { useVisibleDomains, DOMAIN_LABELS, type TrackedDomain } from "@/lib/visibleDomains";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { SearchField } from "@/components/ui/SearchField";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
import { ManageRow } from "@/components/ui/ManageRow";
import { PageHeading } from "@/components/ui/PageHeading";
import { IconColorPicker } from "@/components/ui/IconColorPicker";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";
import { DuplicateItemDialog } from "@/components/ui/DuplicateItemDialog";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";
import { DataExportCard } from "@/components/manage/DataExportCard";
import { AddRow, CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote, ManageNavContext, SectionRow, useSectionMode } from "@/components/manage/ManageSection";
import { SwitchKnob } from "@/components/ui/Switch";
import { useItemActions, type ManageableItem } from "@/lib/useItemActions";
import { getAllItems, getAllCategories, getItemIdentitiesWithHistory, withDataLock } from "@/lib/db/indexedDb";
import { putItemAndSync, deleteCategoryAndSync } from "@/lib/supabase/sync";
import { ensureCategoryId, categoryRowsToSeedForDemo, setCategoryAppearanceAndSync } from "@/lib/categoryResolution";
import { useCareLog } from "@/lib/useCareLog";
import type { CareEntry } from "@/lib/supabase/careLog";
import { lookupFoodCategory } from "@/taxonomy/classify";
import { POLAND_FOOD_CATALOG } from "@/taxonomy/polandFoodCatalog";
import { normalizeName, titleCaseFallback } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, TYPE_ACCENT, type ItemType } from "@/taxonomy/categories";
import { NUTRITION_GROUPS, NUTRITION_GROUP_LABEL, nutritionGroupsForFood, type NutritionGroupId } from "@/taxonomy/nutritionGroups";
import { useFoodNutritionGroupOverrides } from "@/lib/useFoodNutritionGroupOverrides";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import { WORKOUT_UNITS, workoutUnitLabel, defaultWorkoutUnitForCategory, STOOL_COLOR_SWATCH, type RawItem, type RawCategory, type WorkoutUnit, type StoolOptionKind } from "@/lib/types";
import { createReminderList, deleteReminderList, fetchReminderLists, renameReminderList, type ReminderList } from "@/lib/supabase/personalReminders";
import { buildDemoReminderLists } from "@/lib/demoPersonalReminders";
import { createWishlistCategory, deleteWishlistCategory, fetchWishlist, updateWishlistCategory, type WishlistCategory } from "@/lib/supabase/wishlist";
import { buildDemoWishlist } from "@/lib/demoWishlist";
import { clearWeightTarget, fetchWeightTarget, setWeightTarget, type WeightTarget } from "@/lib/supabase/vitals";
import { fetchHabitReminderTimes, setHabitReminderTime, type HabitReminderTimes } from "@/lib/supabase/habitReminders";
import { buildDemoWeightTarget } from "@/lib/demoVitals";
import { useLabs } from "@/lib/useLabs";
import { MarkerForm } from "@/components/doctors/labForms";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  setThemePref,
  useThemePref,
  setLightPalette,
  setDarkPalette,
  useLightPalette,
  useDarkPalette,
  PALETTE_INFO,
  LIGHT_PALETTES,
  DARK_PALETTES,
  type LightPalette,
  type DarkPalette,
} from "@/lib/theme";
import {
  createDoctorSpecialty,
  deleteDoctorSpecialty,
  ensureDoctorSpecialties,
  fetchDoctorSpecialties,
  renameDoctorSpecialty,
  setDoctorSpecialtyArchived,
  type DoctorSpecialty,
} from "@/lib/supabase/doctors";
import { buildDemoDoctorSpecialties } from "@/lib/demoDoctors";
import { DEFAULT_DOCTOR_SPECIALTIES } from "@/lib/doctors";
import {
  createStoolOption,
  defaultStoolOptions,
  deleteStoolOption,
  ensureStoolOptions,
  fetchStoolOptions,
  updateStoolOption,
  type StoolOption,
  type StoolOptionPatch,
} from "@/lib/supabase/stoolOptions";
import {
  createCoffeeOption,
  defaultCoffeeOptions,
  deleteCoffeeOption,
  ensureCoffeeOptions,
  fetchCoffeeOptions,
  updateCoffeeOption,
  type CoffeeOption,
  type CoffeeOptionKind,
  type CoffeeOptionPatch,
} from "@/lib/supabase/coffeeOptions";
import { useCoffee } from "@/lib/useCoffee";
import { useDoctors } from "@/lib/useDoctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import type { Doctor, DoctorPatch } from "@/lib/supabase/doctors";
import { ComboBox, DoctorName, LanguageChips, RatingChips } from "@/components/doctors/shared";
import { useFoodProducts } from "@/lib/useFoodProducts";
import type { FoodProduct, FoodProductPatch } from "@/lib/supabase/foodProducts";

// Log tab order — Food, Symptoms, Supplements, Habits, Stool, Workout,
// Cycle — so the toggle list reads left-to-right the same way the tabs
// it controls do.
const DOMAIN_TOGGLE_ORDER: TrackedDomain[] = ["food", "outcome", "supplement", "habit", "stool", "workout", "cycle", "coffee"];

/** One palette choice: a swatch (page ground + accent dot), its name, and a
 * check on the active one. */
function PaletteRow<T extends string>({ id, active, onClick }: { id: T; active: boolean; onClick: () => void }) {
  const info = PALETTE_INFO[id as LightPalette | DarkPalette];
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
        style={{ background: info.bg, borderColor: "var(--border-hairline)" }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: info.accent }} />
      </span>
      <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
        {info.name}
      </span>
      {active && (
        <span aria-hidden="true" className="text-sm font-semibold" style={{ color: "var(--ui-accent)" }}>
          ✓
        </span>
      )}
    </button>
  );
}

const THEME_LABEL = { light: "Light", dark: "Dark", system: "System" } as const;

/** Light / Dark / System, plus which ground palette each mode uses — all
 * per-device choices (localStorage, applied by a pre-paint script +
 * ThemeManager), not synced. The palette lists show every option regardless
 * of which mode is currently active, since System can resolve to either. */
function AppearanceCard() {
  const pref = useThemePref();
  const lightPalette = useLightPalette();
  const darkPalette = useDarkPalette();
  return (
    <CollapsibleManageCard title="Appearance" subtitle={THEME_LABEL[pref]} bare>
      <SegmentedTabs
        ariaLabel="Theme"
        activeId={pref}
        onSelect={setThemePref}
        items={[
          { id: "light", label: "Light" },
          { id: "dark", label: "Dark" },
          { id: "system", label: "System" },
        ]}
      />
      <GroupNote>Light, dark, or match your device. This device only.</GroupNote>
      <div className="mt-3 flex flex-col gap-1.5">
        <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Light palette
        </h3>
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          {LIGHT_PALETTES.map((id) => (
            <PaletteRow key={id} id={id} active={id === lightPalette} onClick={() => setLightPalette(id)} />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Dark palette
        </h3>
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          {DARK_PALETTES.map((id) => (
            <PaletteRow key={id} id={id} active={id === darkPalette} onClick={() => setDarkPalette(id)} />
          ))}
        </div>
      </div>
    </CollapsibleManageCard>
  );
}

/** Turns a tracked type on/off everywhere it appears — its Log tab and,
 * for Food/Workout/Cycle, its Analytics dashboard link — without deleting
 * or archiving anything underneath. Sections show up on their own once
 * they have data; these toggles override that in either direction. Purely
 * a local display preference (see visibleDomains.tsx), not synced. */
function VisibleSectionsCard({ isDemoData }: { isDemoData: boolean }) {
  const { isVisible, toggle } = useVisibleDomains();
  const [reminders, setReminders] = useState<HabitReminderTimes>({});
  const [remindersLoading, setRemindersLoading] = useState(!isDemoData);
  const [busyDomain, setBusyDomain] = useState<TrackedDomain | null>(null);

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchHabitReminderTimes()
      .then((rows) => !cancelled && setReminders(rows))
      .catch((err) => console.error("fetchHabitReminderTimes failed", err))
      .finally(() => !cancelled && setRemindersLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  async function handleSetReminder(domain: TrackedDomain, time: string | null) {
    setReminders((prev) => {
      const next = { ...prev };
      if (time) next[domain] = time;
      else delete next[domain];
      return next;
    });
    setBusyDomain(domain);
    try {
      await setHabitReminderTime(domain, time);
    } catch (err) {
      console.error("setHabitReminderTime failed", err);
    } finally {
      setBusyDomain(null);
    }
  }

  const shownCount = DOMAIN_TOGGLE_ORDER.filter((d) => isVisible(d)).length;
  const showReminders = !isDemoData && !remindersLoading;

  return (
    <CollapsibleManageCard title="Visible sections" subtitle={`${shownCount} of ${DOMAIN_TOGGLE_ORDER.length} on`} bare>
      <div className={GROUP_CLS} style={GROUP_STYLE}>
        {DOMAIN_TOGGLE_ORDER.map((domain) => {
          const on = isVisible(domain);
          const reminderTime = reminders[domain];
          const busy = busyDomain === domain;
          return (
            <div key={domain}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(domain)}
                className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left"
              >
                <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                  {DOMAIN_LABELS[domain]}
                </span>
                <SwitchKnob on={on} />
              </button>
              {showReminders && on && (
                <label className="flex min-h-11 items-center gap-3 px-3.5">
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Daily reminder
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2">
                    <input
                      type="time"
                      value={reminderTime ?? ""}
                      disabled={busy}
                      onChange={(e) => void handleSetReminder(domain, e.target.value || null)}
                      aria-label={`Reminder time for ${DOMAIN_LABELS[domain]}`}
                      className={FIELD_VALUE}
                      style={FIELD_VALUE_STYLE}
                    />
                    {reminderTime && (
                      <button
                        type="button"
                        onClick={() => void handleSetReminder(domain, null)}
                        disabled={busy}
                        className="shrink-0 text-sm font-medium disabled:opacity-40"
                        style={{ color: "var(--ui-accent)" }}
                      >
                        Clear
                      </button>
                    )}
                  </span>
                </label>
              )}
            </div>
          );
        })}
      </div>
      <GroupNote>
        A section shows on the Log tabs (and its Trends dashboard, if it has one) once you&apos;ve logged something in it. Turn
        one on to start tracking it sooner, or off to hide it even with data — on this device only. Nothing is deleted or
        archived.
        {!isDemoData && " A daily reminder is skipped automatically once you've already logged that day."}
      </GroupNote>
    </CollapsibleManageCard>
  );
}

/** Wishlist lists (the categories on Notes → Wishlist) — name, icon and
 * colour are all edited here now; the Wishlist tab shows each list and its
 * links, with an "Edit in Settings" link. Deleting a list also deletes the
 * links inside it (DB cascade), so the confirm spells that out. */
function WishlistListsCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [lists, setLists] = useState<WishlistCategory[]>(() => (isDemoData ? buildDemoWishlist() : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchWishlist()
      .then((rows) => !cancelled && setLists(rows))
      .catch((err) => console.error("fetchWishlist failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    if (isDemoData) {
      setLists((prev) => [
        ...prev,
        { id: `demo-wl-cat-${Date.now()}`, name, icon: null, color: null, createdAt: new Date().toISOString(), items: [] },
      ]);
      return;
    }
    try {
      const created = await createWishlistCategory(name);
      setLists((prev) => [...prev, created]);
    } catch (err) {
      console.error("createWishlistCategory failed", err);
    }
  }

  async function handlePatch(id: string, patch: { name?: string; icon?: string | null; color?: string | null }) {
    const current = lists.find((l) => l.id === id);
    if (!current) return;
    if (patch.name !== undefined && !patch.name.trim()) return;
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (!isDemoData) await updateWishlistCategory(current, patch).catch((err) => console.error("updateWishlistCategory failed", err));
  }

  async function handleDelete(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id));
    if (!isDemoData) await deleteWishlistCategory(id).catch((err) => console.error("deleteWishlistCategory failed", err));
  }

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const visibleLists = (isSearching ? lists.filter((l) => l.name.toLowerCase().includes(query)) : lists)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  if (isSearching && visibleLists.length === 0) return null;

  return (
    <CollapsibleManageCard
      title="Wishlist lists"
      subtitle={loading ? undefined : `${lists.length} list${lists.length === 1 ? "" : "s"}`}
      forceOpen={isSearching}
      bare
    >
      <AddRow value={newName} onChange={setNewName} onSubmit={handleAdd} placeholder="New list name" maxLength={40} label="Add list" />

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <ul className={GROUP_CLS} style={GROUP_STYLE}>
          {!isSearching && lists.length === 0 && (
            <li className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No lists yet — add one above, or from the Wishlist tab while saving a link.
            </li>
          )}
          {visibleLists.map((l) => (
            <ManageRow
              key={l.id}
              name={l.name}
              maxLength={40}
              appearance={{
                icon: l.icon,
                color: l.color,
                accent: customColorValue(l.color) ?? "var(--series-2)",
                onIconChange: (icon) => void handlePatch(l.id, { icon }),
                onColorChange: (color) => void handlePatch(l.id, { color }),
              }}
              onRename={(next) => void handlePatch(l.id, { name: next })}
              onDelete={() => void handleDelete(l.id)}
            />
          ))}
        </ul>
      )}
      <GroupNote>
        The lists your saved links are grouped into on Notes &rarr; Wishlist. Deleting a list also deletes the links
        saved in it.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

/** The optional weight-goal range — one per user. Health → Vitals draws it
 * as a shaded band on the weight chart and shows it read-only with an "Edit
 * in Settings" link; the range is set and cleared here. */
function WeightGoalCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [target, setTarget] = useState<WeightTarget | null>(() => (isDemoData ? buildDemoWeightTarget() : null));
  const [loading, setLoading] = useState(!isDemoData);
  const [editing, setEditing] = useState(false);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchWeightTarget()
      .then((row) => !cancelled && setTarget(row))
      .catch((err) => console.error("fetchWeightTarget failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  if (isSearching && !"weight goal target range".includes(query)) return null;

  const lo = Number(low.replace(",", "."));
  const hi = Number(high.replace(",", "."));
  const canSave = low.trim() !== "" && high.trim() !== "" && Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo;

  function startEditing() {
    setLow(target ? String(target.lowKg) : "");
    setHigh(target ? String(target.highKg) : "");
    setEditing(true);
  }

  async function save() {
    const next = { lowKg: lo, highKg: hi };
    setTarget(next);
    setEditing(false);
    if (!isDemoData) await setWeightTarget(next).catch((err) => console.error("setWeightTarget failed", err));
  }

  async function clear() {
    setTarget(null);
    setEditing(false);
    if (!isDemoData) await clearWeightTarget().catch((err) => console.error("clearWeightTarget failed", err));
  }

  return (
    <CollapsibleManageCard
      title="Weight goal"
      subtitle={loading ? undefined : target ? `${target.lowKg}–${target.highKg} kg` : "not set"}
      forceOpen={isSearching}
      bare
    >
      {loading ? (
        <p className="px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : editing ? (
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <label className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
              From (kg)
            </span>
            <input
              value={low}
              onChange={(e) => setLow(e.target.value)}
              inputMode="decimal"
              placeholder="64"
              className={`${FIELD_VALUE} tabular-nums`}
              style={FIELD_VALUE_STYLE}
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
              To (kg)
            </span>
            <input
              value={high}
              onChange={(e) => setHigh(e.target.value)}
              inputMode="decimal"
              placeholder="66"
              className={`${FIELD_VALUE} tabular-nums`}
              style={FIELD_VALUE_STYLE}
            />
          </label>
          <div className="flex min-h-11 items-center justify-between px-3.5">
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
            <button type="button" disabled={!canSave} onClick={() => void save()} className="min-h-11 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
              Save
            </button>
          </div>
        </div>
      ) : target ? (
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <button type="button" onClick={startEditing} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left">
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              Target range
            </span>
            <span className="flex items-center gap-1.5 text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
              {target.lowKg}–{target.highKg} kg
              <ChevronIcon dir="right" size={14} />
            </span>
          </button>
          <button type="button" onClick={() => void clear()} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--status-critical)" }}>
            Clear target
          </button>
        </div>
      ) : (
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <button type="button" onClick={startEditing} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--ui-accent)" }}>
            Set a target range
          </button>
        </div>
      )}
      <GroupNote>A target weight range, drawn as a shaded band on the weight chart in Health &rarr; Vitals.</GroupNote>
    </CollapsibleManageCard>
  );
}

/** Lab markers and panels behind Health → Results. All definition —
 * marker name, unit, reference + optimal ranges, panel grouping, panel
 * name/icon/colour — is edited here; the Results tab keeps only value
 * entry (a single value or a whole draw) and a slim marker quick-add. */
function LabResultsCard({ searchQuery }: { searchQuery: string }) {
  const labs = useLabs();
  const accent = "var(--ui-accent)";
  const [addingMarker, setAddingMarker] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [confirmingMarker, setConfirmingMarker] = useState<string | null>(null);
  const [newPanel, setNewPanel] = useState("");

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const markers = labs.markers.data;
  const panels = labs.panels.data;
  const markerMatches = (name: string) => !isSearching || name.toLowerCase().includes(query);
  const shownMarkers = markers.filter((m) => markerMatches(m.name));
  const shownPanels = panels.filter((p) => !isSearching || p.name.toLowerCase().includes(query));

  const groups = [
    ...panels.map((p) => ({ id: p.id, name: p.name, markers: shownMarkers.filter((m) => m.panelId === p.id) })),
    { id: "", name: "No panel", markers: shownMarkers.filter((m) => !m.panelId) },
  ].filter((g) => g.markers.length > 0);

  if (isSearching && shownMarkers.length === 0 && shownPanels.length === 0) return null;

  async function addPanel(e: FormEvent) {
    e.preventDefault();
    const name = newPanel.trim();
    if (!name) return;
    setNewPanel("");
    await labs.panels.create(name).catch((err) => console.error("createLabPanel failed", err));
  }

  return (
    <CollapsibleManageCard
      title="Lab results"
      subtitle={labs.loading ? undefined : `${markers.length} marker${markers.length === 1 ? "" : "s"}${panels.length > 0 ? ` · ${panels.length} panel${panels.length === 1 ? "" : "s"}` : ""}`}
      forceOpen={isSearching}
      bare
    >
      {labs.loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : labs.error ? (
        <p className="py-3 text-xs" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load your results.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              Panels
            </h3>
            <AddRow value={newPanel} onChange={setNewPanel} onSubmit={addPanel} placeholder="New panel name" maxLength={60} label="Add" />
            {panels.length === 0 ? (
              <GroupNote>No panels yet — markers can stay ungrouped.</GroupNote>
            ) : (
              <ul className={GROUP_CLS} style={GROUP_STYLE}>
                {shownPanels.map((p) => (
                  <ManageRow
                    key={p.id}
                    name={p.name}
                    maxLength={60}
                    appearance={{
                      icon: p.icon,
                      color: p.color,
                      accent: customColorValue(p.color) ?? accent,
                      onIconChange: (icon) => void labs.panels.rename(p.id, { icon }),
                      onColorChange: (color) => void labs.panels.rename(p.id, { color }),
                    }}
                    onRename={(next) => void labs.panels.rename(p.id, { name: next })}
                    onDelete={() => void labs.panels.remove(p.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              Markers
            </h3>
            {!isSearching && !addingMarker && (
              <div className={GROUP_CLS} style={GROUP_STYLE}>
                <button type="button" onClick={() => setAddingMarker(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--ui-accent)" }}>
                  New marker
                </button>
              </div>
            )}

            {addingMarker && <MarkerForm labs={labs} accent={accent} fields="all" onSaved={() => setAddingMarker(false)} onCancel={() => setAddingMarker(false)} />}

            {markers.length === 0 && !addingMarker ? (
              <GroupNote>No markers yet.</GroupNote>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((g) => (
                  <div key={g.id || "__none__"} className="flex flex-col gap-1.5">
                    <p className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                      {g.name}
                    </p>
                    <ul className={GROUP_CLS} style={GROUP_STYLE}>
                      {g.markers.map((m) => {
                        const isEditing = editingMarkerId === m.id;
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingMarker(null);
                                setEditingMarkerId(isEditing ? null : m.id);
                              }}
                              aria-expanded={isEditing}
                              className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                                {m.name}
                              </span>
                              {m.unit && (
                                <span className="shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
                                  {m.unit}
                                </span>
                              )}
                              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                                <ChevronIcon dir={isEditing ? "down" : "right"} size={14} />
                              </span>
                            </button>
                            {isEditing && (
                              <div className="flex flex-col gap-2 border-t p-3" style={{ borderColor: "var(--gridline)" }}>
                                <MarkerForm labs={labs} accent={accent} fields="all" initial={m} onSaved={() => setEditingMarkerId(null)} onCancel={() => setEditingMarkerId(null)} />
                                <div className="flex min-h-11 items-center justify-end gap-4">
                                  {confirmingMarker === m.id ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setConfirmingMarker(null);
                                          setEditingMarkerId(null);
                                          void labs.markers.remove(m.id);
                                        }}
                                        className="min-h-11 text-sm font-semibold"
                                        style={{ color: "var(--status-critical)" }}
                                      >
                                        Delete{m.results.length > 0 ? ` with ${m.results.length} result${m.results.length === 1 ? "" : "s"}` : ""}
                                      </button>
                                      <button type="button" onClick={() => setConfirmingMarker(null)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                                        Keep
                                      </button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => setConfirmingMarker(m.id)} className="min-h-11 text-sm" style={{ color: "var(--status-critical)" }}>
                                      Delete marker
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <GroupNote>
        The markers and panels behind Health &rarr; Results. Enter values &mdash; a single reading or a whole blood draw &mdash;
        on the Results tab.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

/** Reminder lists (the "To Do" / "To Buy" buckets on Log → Reminders) —
 * created, renamed and deleted here; on Agenda a list is just a filter chip
 * itself, so that tab stays a plain list switcher. Deleting a list drops
 * its tasks back to the default "Reminders" bucket (DB `on delete set
 * null`), it never removes them. */
function ReminderListsCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [lists, setLists] = useState<ReminderList[]>(() => (isDemoData ? buildDemoReminderLists() : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchReminderLists()
      .then((rows) => !cancelled && setLists(rows))
      .catch((err) => console.error("fetchReminderLists failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    if (isDemoData) {
      setLists((prev) => [...prev, { id: `demo-list-${Date.now()}`, name, sortOrder: prev.length, icon: null, color: null }]);
      return;
    }
    try {
      const created = await createReminderList(name, lists.length);
      setLists((prev) => [...prev, created]);
    } catch (err) {
      console.error("createReminderList failed", err);
    }
  }

  async function handleRename(id: string, name: string) {
    const next = name.trim();
    if (!next) return;
    const current = lists.find((l) => l.id === id);
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: next } : l)));
    if (!isDemoData && current) await renameReminderList(current, { name: next }).catch((err) => console.error("renameReminderList failed", err));
  }

  async function handleAppearance(id: string, patch: { icon?: string | null; color?: string | null }) {
    const current = lists.find((l) => l.id === id);
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (!isDemoData && current) await renameReminderList(current, patch).catch((err) => console.error("renameReminderList failed", err));
  }

  async function handleDelete(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id));
    if (!isDemoData) await deleteReminderList(id).catch((err) => console.error("deleteReminderList failed", err));
  }

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const visibleLists = (isSearching ? lists.filter((l) => l.name.toLowerCase().includes(query)) : lists)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  if (isSearching && visibleLists.length === 0) return null;

  return (
    <CollapsibleManageCard
      title="Reminder lists"
      subtitle={loading ? undefined : `${lists.length} list${lists.length === 1 ? "" : "s"}`}
      forceOpen={isSearching}
      bare
    >
      <AddRow value={newName} onChange={setNewName} onSubmit={handleAdd} placeholder="New list name" maxLength={40} label="Add list" />

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <ul className={GROUP_CLS} style={GROUP_STYLE}>
          {!isSearching && lists.length === 0 && (
            <li className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No custom lists yet — everything sits in the default &ldquo;Reminders&rdquo; list.
            </li>
          )}
          {visibleLists.map((l) => (
            <ManageRow
              key={l.id}
              name={l.name}
              maxLength={40}
              appearance={{
                icon: l.icon,
                color: l.color,
                accent: customColorValue(l.color) ?? "var(--series-berry)",
                onIconChange: (icon) => void handleAppearance(l.id, { icon }),
                onColorChange: (color) => void handleAppearance(l.id, { color }),
              }}
              onRename={(next) => void handleRename(l.id, next)}
              onDelete={() => void handleDelete(l.id)}
            />
          ))}
        </ul>
      )}
      <GroupNote>
        The buckets your reminders are organised into on the Log page. Deleting a list moves its reminders back to
        the default &ldquo;Reminders&rdquo; list — it never deletes them.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

/** The selectable doctor-type list behind the Medical page's pickers.
 * Built-in defaults show until the user edits one, at which point the whole
 * set is saved as real rows (same "rows win once they exist" rule as item
 * categories). Every type can be renamed, hidden (kept out of the picker,
 * one tap to restore — appointments keep their own frozen type), or
 * deleted. */
function DoctorSpecialtiesCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [rows, setRows] = useState<DoctorSpecialty[]>(() => (isDemoData ? buildDemoDoctorSpecialties() : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [hiddenOpen, setHiddenOpen] = useState(false);

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchDoctorSpecialties()
      .then((specialties) => !cancelled && setRows(specialties))
      .catch((err) => console.error("fetchDoctorSpecialties failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const entries =
    rows.length > 0
      ? rows.map((r) => ({ key: r.name.toLowerCase(), name: r.name, isArchived: r.isArchived, icon: r.icon, color: r.color }))
      : DEFAULT_DOCTOR_SPECIALTIES.map((name) => ({ key: name.toLowerCase(), name, isArchived: false, icon: null, color: null }));

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const matchesQuery = (e: { name: string }) => !isSearching || e.name.toLowerCase().includes(query);
  const active = entries.filter((e) => !e.isArchived && matchesQuery(e)).sort((a, b) => a.name.localeCompare(b.name));
  const hidden = entries.filter((e) => e.isArchived && matchesQuery(e)).sort((a, b) => a.name.localeCompare(b.name));

  if (isSearching && active.length === 0 && hidden.length === 0) return null;

  /** Turns the built-in defaults into real rows the first time one is
   * edited, so an edit actually persists — mirrors `ensureCategoryId`. */
  async function realize(): Promise<DoctorSpecialty[]> {
    if (isDemoData || rows.length > 0) return rows;
    const fresh = await ensureDoctorSpecialties();
    setRows(fresh);
    return fresh;
  }

  const findRow = (list: DoctorSpecialty[], name: string) => list.find((r) => r.name.toLowerCase() === name.toLowerCase());

  async function run(action: (fresh: DoctorSpecialty[]) => Promise<void>) {
    setBusy(true);
    try {
      await action(isDemoData ? rows : await realize());
    } catch (err) {
      console.error("doctor type action failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    setNewName("");
    if (!name) return;
    if (isDemoData) {
      setRows((prev) => {
        const existing = findRow(prev, name);
        if (existing) return prev.map((r) => (r.id === existing.id ? { ...r, isArchived: false } : r));
        return [...prev, { id: `demo-spec-${Date.now()}`, name, nextAppointmentDate: null, isArchived: false, icon: null, color: null }];
      });
      return;
    }
    await run(async (fresh) => {
      const existing = findRow(fresh, name);
      if (existing) {
        if (existing.isArchived) {
          const updated = await setDoctorSpecialtyArchived(existing, false);
          setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }
        return;
      }
      const created = await createDoctorSpecialty(name);
      setRows((prev) => [...prev, created]);
    });
  }

  async function handleRename(name: string, nextName: string) {
    const next = nextName.trim();
    if (!next || next.toLowerCase() === name.toLowerCase()) return;
    if (isDemoData) {
      setRows((prev) => prev.map((r) => (r.name.toLowerCase() === name.toLowerCase() ? { ...r, name: next } : r)));
      return;
    }
    await run(async (fresh) => {
      const row = findRow(fresh, name);
      if (!row) return;
      const updated = await renameDoctorSpecialty(row, { name: next });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    });
  }

  async function handleAppearance(name: string, patch: { icon?: string | null; color?: string | null }) {
    if (isDemoData) {
      setRows((prev) => prev.map((r) => (r.name.toLowerCase() === name.toLowerCase() ? { ...r, ...patch } : r)));
      return;
    }
    await run(async (fresh) => {
      const row = findRow(fresh, name);
      if (!row) return;
      const updated = await renameDoctorSpecialty(row, patch);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    });
  }

  async function handleArchive(name: string, archived: boolean) {
    if (isDemoData) {
      setRows((prev) => prev.map((r) => (r.name.toLowerCase() === name.toLowerCase() ? { ...r, isArchived: archived } : r)));
      return;
    }
    await run(async (fresh) => {
      const row = findRow(fresh, name);
      if (!row) return;
      const updated = await setDoctorSpecialtyArchived(row, archived);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    });
  }

  async function handleDelete(name: string) {
    if (isDemoData) {
      setRows((prev) => prev.filter((r) => r.name.toLowerCase() !== name.toLowerCase()));
      return;
    }
    await run(async (fresh) => {
      const row = findRow(fresh, name);
      if (!row) return;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      await deleteDoctorSpecialty(row.id);
    });
  }

  const rowEl = (e: { key: string; name: string; isArchived: boolean; icon: string | null; color: string | null }) => (
    <ManageRow
      key={e.key}
      name={e.name}
      isArchived={e.isArchived}
      busy={busy}
      appearance={{
        icon: e.icon,
        color: e.color,
        accent: customColorValue(e.color) ?? "var(--series-3)",
        onIconChange: (icon) => void handleAppearance(e.name, { icon }),
        onColorChange: (color) => void handleAppearance(e.name, { color }),
      }}
      onRename={(next) => void handleRename(e.name, next)}
      onToggleHide={() => void handleArchive(e.name, !e.isArchived)}
      onDelete={() => void handleDelete(e.name)}
    />
  );

  const totalActive = entries.filter((e) => !e.isArchived).length;
  const totalHidden = entries.filter((e) => e.isArchived).length;

  return (
    <CollapsibleManageCard
      title="Doctor types"
      subtitle={loading ? undefined : `${totalActive} active${totalHidden > 0 ? ` · ${totalHidden} hidden` : ""}`}
      forceOpen={isSearching}
      bare
    >
      <AddRow value={newName} onChange={setNewName} onSubmit={handleAdd} placeholder="New doctor type" maxLength={60} label="Add type" />

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <>
          <ul className={GROUP_CLS} style={GROUP_STYLE}>
            {active.length === 0 && !isSearching && (
              <li className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                Every type is hidden — add one above or show one back.
              </li>
            )}
            {active.map(rowEl)}
          </ul>

          {hidden.length > 0 && (
            <div className={GROUP_CLS} style={GROUP_STYLE}>
              <button
                type="button"
                onClick={() => setHiddenOpen((v) => !v)}
                disabled={isSearching}
                aria-expanded={isSearching || hiddenOpen}
                className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
              >
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  Hidden
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                  {hidden.length}
                  {!isSearching && <ChevronIcon dir={hiddenOpen ? "down" : "right"} size={14} />}
                </span>
              </button>
              {(isSearching || hiddenOpen) && (
                <ul className="inset-rows border-t opacity-70" style={{ borderColor: "var(--gridline)" }}>
                  {hidden.map(rowEl)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      <GroupNote>
        The specialties offered when logging a doctor appointment. Hide the ones you don&apos;t need or add your own —
        appointments you&apos;ve already logged keep their type either way.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

// --- Stool options ---------------------------------------------------

const STOOL_OPTION_KINDS: { kind: StoolOptionKind; title: string; placeholder: string }[] = [
  { kind: "color", title: "Colours", placeholder: "e.g. Grey" },
  { kind: "characteristic", title: "Characteristics", placeholder: "e.g. Greasy" },
  { kind: "floatation", title: "Floatation", placeholder: "e.g. Sinks fast" },
  { kind: "symptom", title: "Symptoms", placeholder: "e.g. Rectal itching" },
];

/** One kind of chip option (Stool colours, Coffee brewing types, …): a
 * heading, an add row, the active options as tap-to-edit rows, and a
 * collapsible Hidden group. */
function OptionKindGroup<T extends { id: string; label: string; isArchived: boolean; swatch?: string | null }>({
  title,
  placeholder,
  newLabel,
  onNewLabelChange,
  onAdd,
  active,
  hidden,
  showHidden,
  canToggleHidden,
  onToggleHidden,
  busy,
  onPatch,
  onDelete,
  withSwatch = false,
}: {
  title: string;
  placeholder: string;
  newLabel: string;
  onNewLabelChange: (value: string) => void;
  onAdd: () => void;
  active: T[];
  hidden: T[];
  showHidden: boolean;
  canToggleHidden: boolean;
  onToggleHidden: () => void;
  busy: boolean;
  onPatch: (option: T, patch: { label?: string; isArchived?: boolean; swatch?: string }) => void;
  onDelete: (option: T) => void;
  withSwatch?: boolean;
}) {
  const row = (o: T) => (
    <ManageRow
      key={o.id}
      name={o.label}
      isArchived={o.isArchived}
      busy={busy}
      swatch={withSwatch ? { value: o.swatch ?? "#8a5a34", onChange: (value) => onPatch(o, { swatch: value }) } : undefined}
      onRename={(next) => onPatch(o, { label: next })}
      onToggleHide={() => onPatch(o, { isArchived: !o.isArchived })}
      onDelete={() => onDelete(o)}
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <AddRow
        value={newLabel}
        onChange={onNewLabelChange}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
        placeholder={placeholder}
        maxLength={60}
        disabled={busy}
      />
      {(active.length > 0 || hidden.length === 0) && (
        <ul className={GROUP_CLS} style={GROUP_STYLE}>
          {active.length === 0 ? (
            <li className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing here yet.
            </li>
          ) : (
            active.map(row)
          )}
        </ul>
      )}
      {hidden.length > 0 && (
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <button
            type="button"
            onClick={onToggleHidden}
            disabled={!canToggleHidden}
            aria-expanded={showHidden}
            className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
          >
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Hidden
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
              {hidden.length}
              {canToggleHidden && <ChevronIcon dir={showHidden ? "down" : "right"} size={14} />}
            </span>
          </button>
          {showHidden && (
            <ul className="inset-rows border-t opacity-70" style={{ borderColor: "var(--gridline)" }}>
              {hidden.map(row)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function demoStoolOptionRows(): StoolOption[] {
  return STOOL_OPTION_KINDS.flatMap(({ kind }) =>
    defaultStoolOptions(kind).map<StoolOption>((label, i) => ({
      id: `demo:${kind}:${label}`,
      kind,
      label,
      swatch: kind === "color" ? (STOOL_COLOR_SWATCH[label] ?? null) : null,
      sortOrder: i,
      isArchived: false,
    })),
  );
}

function StoolOptionsCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [rows, setRows] = useState<StoolOption[]>(() => (isDemoData ? demoStoolOptionRows() : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [busy, setBusy] = useState(false);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const [hiddenOpen, setHiddenOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchStoolOptions()
      .then((data) => !cancelled && setRows(data))
      .catch((err) => console.error("fetchStoolOptions failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  /** Materialize the defaults for a kind on first edit, mirroring
   * DoctorSpecialtiesCard's `realize`. */
  async function realize(kind: StoolOptionKind): Promise<StoolOption[]> {
    if (isDemoData || rows.some((r) => r.kind === kind)) return rows;
    const fresh = await ensureStoolOptions(kind);
    setRows(fresh);
    return fresh;
  }

  async function run(kind: StoolOptionKind, action: (fresh: StoolOption[]) => Promise<void>) {
    setBusy(true);
    try {
      await action(isDemoData ? rows : await realize(kind));
    } catch (err) {
      console.error("stool option action failed", err);
    } finally {
      setBusy(false);
    }
  }

  function entriesFor(kind: StoolOptionKind) {
    const mine = rows.filter((r) => r.kind === kind);
    if (mine.length > 0) return [...mine].sort((a, b) => a.sortOrder - b.sortOrder);
    return defaultStoolOptions(kind).map<StoolOption>((label, i) => ({
      id: `default:${kind}:${label}`,
      kind,
      label,
      swatch: kind === "color" ? (STOOL_COLOR_SWATCH[label] ?? null) : null,
      sortOrder: i,
      isArchived: false,
    }));
  }

  async function addOption(kind: StoolOptionKind) {
    const label = (newLabels[kind] ?? "").trim();
    setNewLabels((p) => ({ ...p, [kind]: "" }));
    if (!label) return;
    if (isDemoData) {
      setRows((prev) =>
        prev.some((r) => r.kind === kind && r.label.toLowerCase() === label.toLowerCase())
          ? prev
          : [...prev, { id: `demo-stool-opt-${Date.now()}`, kind, label, swatch: null, sortOrder: 99, isArchived: false }],
      );
      return;
    }
    await run(kind, async (fresh) => {
      if (fresh.some((r) => r.kind === kind && r.label.toLowerCase() === label.toLowerCase())) return;
      const sortOrder = Math.max(-1, ...fresh.filter((r) => r.kind === kind).map((r) => r.sortOrder)) + 1;
      const created = await createStoolOption(kind, label, sortOrder);
      setRows((prev) => [...prev, created]);
    });
  }

  async function patch(option: StoolOption, p: StoolOptionPatch) {
    if (isDemoData) {
      setRows((prev) => prev.map((r) => (r.id === option.id ? { ...r, ...p, label: p.label?.trim() ?? r.label } : r)));
      return;
    }
    await run(option.kind, async (fresh) => {
      const row = fresh.find((r) => r.kind === option.kind && r.label.toLowerCase() === option.label.toLowerCase()) ?? option;
      const updated = await updateStoolOption(row, p);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    });
  }

  async function removeOption(option: StoolOption) {
    if (isDemoData) {
      setRows((prev) => prev.filter((r) => r.id !== option.id));
      return;
    }
    await run(option.kind, async (fresh) => {
      const row = fresh.find((r) => r.kind === option.kind && r.label.toLowerCase() === option.label.toLowerCase());
      if (!row) return;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      await deleteStoolOption(row.id);
    });
  }

  const totalActive = STOOL_OPTION_KINDS.reduce((n, k) => n + entriesFor(k.kind).filter((e) => !e.isArchived).length, 0);

  return (
    <CollapsibleManageCard
      title="Stool options"
      subtitle={loading ? undefined : `${totalActive} chips`}
      forceOpen={isSearching}
      bare
    >
      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {STOOL_OPTION_KINDS.map(({ kind, title, placeholder }) => {
            const all = entriesFor(kind).filter((e) => !isSearching || e.label.toLowerCase().includes(query));
            const active = all.filter((e) => !e.isArchived);
            const hidden = all.filter((e) => e.isArchived);
            if (isSearching && all.length === 0) return null;
            const showHidden = isSearching || hiddenOpen[kind];
            return (
              <OptionKindGroup
                key={kind}
                title={title}
                placeholder={placeholder}
                newLabel={newLabels[kind] ?? ""}
                onNewLabelChange={(value) => setNewLabels((p) => ({ ...p, [kind]: value }))}
                onAdd={() => void addOption(kind)}
                active={active}
                hidden={hidden}
                showHidden={showHidden}
                canToggleHidden={!isSearching}
                onToggleHidden={() => setHiddenOpen((p) => ({ ...p, [kind]: !p[kind] }))}
                busy={busy}
                onPatch={(o, patchValue) => void patch(o, patchValue)}
                onDelete={(o) => void removeOption(o)}
                withSwatch={kind === "color"}
              />
            );
          })}
        </div>
      )}
      <GroupNote>
        The chips offered in the Log page&apos;s Stool tab. Hide the ones you don&apos;t use or add your own — entries you&apos;ve
        already logged keep their value either way.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

const COFFEE_OPTION_KINDS: { kind: CoffeeOptionKind; title: string; placeholder: string }[] = [
  { kind: "brewing_type", title: "Brewing types", placeholder: "e.g. Pour over" },
  { kind: "brewing_method", title: "Brewing methods", placeholder: "e.g. Chemex" },
  { kind: "characteristic", title: "Characteristics", placeholder: "e.g. Winey" },
];

function demoCoffeeOptionRows(): CoffeeOption[] {
  return COFFEE_OPTION_KINDS.flatMap(({ kind }) =>
    defaultCoffeeOptions(kind).map<CoffeeOption>((label, i) => ({ id: `demo:${kind}:${label}`, kind, label, sortOrder: i, isArchived: false })),
  );
}

/** Every coffee-tracking config in one place: the currency shown next to
 * every price, the three editable chip lists the Log page's Coffee dialog
 * offers, and the coffee catalog itself (edit/archive/delete only — new
 * coffees are added from Log → Coffee, where brand is typed once against
 * the actual cup being logged; see CoffeeTab). */
function CoffeeCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const coffee = useCoffee();
  const [rows, setRows] = useState<CoffeeOption[]>(() => (isDemoData ? demoCoffeeOptionRows() : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [busy, setBusy] = useState(false);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const [hiddenOpen, setHiddenOpen] = useState<Record<string, boolean>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftBrand, setDraftBrand] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchCoffeeOptions()
      .then((data) => !cancelled && setRows(data))
      .catch((err) => console.error("fetchCoffeeOptions failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  async function realize(kind: CoffeeOptionKind): Promise<CoffeeOption[]> {
    if (isDemoData || rows.some((r) => r.kind === kind)) return rows;
    const fresh = await ensureCoffeeOptions(kind);
    setRows(fresh);
    return fresh;
  }

  async function run(kind: CoffeeOptionKind, action: (fresh: CoffeeOption[]) => Promise<void>) {
    setBusy(true);
    try {
      await action(isDemoData ? rows : await realize(kind));
    } catch (err) {
      console.error("coffee option action failed", err);
    } finally {
      setBusy(false);
    }
  }

  function entriesFor(kind: CoffeeOptionKind) {
    const mine = rows.filter((r) => r.kind === kind);
    if (mine.length > 0) return [...mine].sort((a, b) => a.sortOrder - b.sortOrder);
    return defaultCoffeeOptions(kind).map<CoffeeOption>((label, i) => ({ id: `default:${kind}:${label}`, kind, label, sortOrder: i, isArchived: false }));
  }

  async function addOption(kind: CoffeeOptionKind) {
    const label = (newLabels[kind] ?? "").trim();
    setNewLabels((p) => ({ ...p, [kind]: "" }));
    if (!label) return;
    if (isDemoData) {
      setRows((prev) => (prev.some((r) => r.kind === kind && r.label.toLowerCase() === label.toLowerCase()) ? prev : [...prev, { id: `demo-coffee-opt-${Date.now()}`, kind, label, sortOrder: 99, isArchived: false }]));
      return;
    }
    await run(kind, async (fresh) => {
      if (fresh.some((r) => r.kind === kind && r.label.toLowerCase() === label.toLowerCase())) return;
      const sortOrder = Math.max(-1, ...fresh.filter((r) => r.kind === kind).map((r) => r.sortOrder)) + 1;
      const created = await createCoffeeOption(kind, label, sortOrder);
      setRows((prev) => [...prev, created]);
    });
  }

  async function patch(option: CoffeeOption, p: CoffeeOptionPatch) {
    if (isDemoData) {
      setRows((prev) => prev.map((r) => (r.id === option.id ? { ...r, ...p, label: p.label?.trim() ?? r.label } : r)));
      return;
    }
    await run(option.kind, async (fresh) => {
      const row = fresh.find((r) => r.kind === option.kind && r.label.toLowerCase() === option.label.toLowerCase()) ?? option;
      const updated = await updateCoffeeOption(row, p);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    });
  }

  async function removeOption(option: CoffeeOption) {
    if (isDemoData) {
      setRows((prev) => prev.filter((r) => r.id !== option.id));
      return;
    }
    await run(option.kind, async (fresh) => {
      const row = fresh.find((r) => r.kind === option.kind && r.label.toLowerCase() === option.label.toLowerCase());
      if (!row) return;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      await deleteCoffeeOption(row.id);
    });
  }

  function startEditItem(item: { id: string; name: string; brand: string | null; notes: string | null }) {
    setEditingItemId(item.id);
    setDraftName(item.name);
    setDraftBrand(item.brand ?? "");
    setDraftNotes(item.notes ?? "");
  }

  async function saveItemEdit() {
    const item = coffee.items.data.find((it) => it.id === editingItemId);
    if (!item) return;
    setEditingItemId(null);
    await coffee.items.edit(item, { name: draftName, brand: draftBrand, notes: draftNotes });
  }

  const totalActive = COFFEE_OPTION_KINDS.reduce((n, k) => n + entriesFor(k.kind).filter((e) => !e.isArchived).length, 0);
  const items = coffee.items.data.filter((it) => !isSearching || it.name.toLowerCase().includes(query) || (it.brand ?? "").toLowerCase().includes(query));

  return (
    <CollapsibleManageCard
      title="Coffee"
      subtitle={loading ? undefined : `${totalActive} chips · ${coffee.items.data.length} coffees`}
      forceOpen={isSearching}
      bare
    >
      <label className={`${GROUP_CLS} flex min-h-11 items-center gap-3 px-3.5`} style={GROUP_STYLE}>
        <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
          Currency
        </span>
        <input
          value={coffee.currency.value}
          onChange={(e) => void coffee.currency.set(e.target.value)}
          maxLength={6}
          aria-label="Currency shown next to coffee prices"
          className={FIELD_VALUE}
          style={FIELD_VALUE_STYLE}
        />
      </label>

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {COFFEE_OPTION_KINDS.map(({ kind, title, placeholder }) => {
            const all = entriesFor(kind).filter((e) => !isSearching || e.label.toLowerCase().includes(query));
            const active = all.filter((e) => !e.isArchived);
            const hidden = all.filter((e) => e.isArchived);
            if (isSearching && all.length === 0) return null;
            const showHidden = isSearching || hiddenOpen[kind];
            return (
              <OptionKindGroup
                key={kind}
                title={title}
                placeholder={placeholder}
                newLabel={newLabels[kind] ?? ""}
                onNewLabelChange={(value) => setNewLabels((p) => ({ ...p, [kind]: value }))}
                onAdd={() => void addOption(kind)}
                active={active}
                hidden={hidden}
                showHidden={showHidden}
                canToggleHidden={!isSearching}
                onToggleHidden={() => setHiddenOpen((p) => ({ ...p, [kind]: !p[kind] }))}
                busy={busy}
                onPatch={(o, patchValue) => void patch(o, patchValue)}
                onDelete={(o) => void removeOption(o)}
              />
            );
          })}

          <div className="flex flex-col gap-1.5">
            <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              Your coffees
            </h3>
            {items.length === 0 ? (
              <GroupNote>{isSearching ? "No coffee matches that search." : "Nothing logged yet."}</GroupNote>
            ) : (
              <ul className={GROUP_CLS} style={GROUP_STYLE}>
                {items.map((it) => {
                  const editing = editingItemId === it.id;
                  const changed =
                    draftName.trim() !== it.name || draftBrand.trim() !== (it.brand ?? "") || draftNotes.trim() !== (it.notes ?? "");
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => (editing ? setEditingItemId(null) : startEditItem(it))}
                        aria-expanded={editing}
                        className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: it.isArchived ? "var(--text-muted)" : "var(--text-primary)" }}>
                          {it.name}
                        </span>
                        {(it.brand || it.isArchived) && (
                          <span className="shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
                            {it.isArchived ? "Hidden" : it.brand}
                          </span>
                        )}
                        <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                          <ChevronIcon dir={editing ? "down" : "right"} size={14} />
                        </span>
                      </button>
                      {editing && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveItemEdit();
                          }}
                          className="inset-rows border-t"
                          style={{ borderColor: "var(--gridline)", background: "color-mix(in oklab, var(--page-plane) 55%, var(--surface-1))" }}
                        >
                          {(
                            [
                              ["Name", draftName, setDraftName],
                              ["Brand", draftBrand, setDraftBrand],
                              ["Notes", draftNotes, setDraftNotes],
                            ] as const
                          ).map(([label, value, set]) => (
                            <label key={label} className="flex min-h-11 items-center gap-3 px-3.5">
                              <span className="w-14 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                                {label}
                              </span>
                              <input value={value} onChange={(e) => set(e.target.value)} className={FIELD_VALUE} style={FIELD_VALUE_STYLE} />
                            </label>
                          ))}
                          <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
                            <button
                              type="button"
                              onClick={() => void coffee.items.edit(it, { isArchived: !it.isArchived })}
                              className="min-h-11 text-sm"
                              style={{ color: "var(--ui-accent)" }}
                            >
                              {it.isArchived ? "Show" : "Hide"}
                            </button>
                            <button type="submit" disabled={!changed} className="min-h-11 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                              Save
                            </button>
                          </div>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <GroupNote>New coffees are added from Log → Coffee, not here — edit or hide existing ones above.</GroupNote>
          </div>
        </div>
      )}
    </CollapsibleManageCard>
  );
}

// --- Doctors -------------------------------------------------------

function DoctorsCard({ searchQuery }: { searchQuery: string }) {
  const api = useDoctors();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSpecialty, setNewSpecialty] = useState("");
  const [busy, setBusy] = useState(false);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const accent = "var(--ui-accent)";

  const specialtyOptions = resolveSpecialtyNames(
    api.specialties.data,
    api.appointments.data.map((a) => a.specialty),
    api.doctors.data.map((d) => d.specialty),
  );

  const shown = api.doctors.data.filter((d) => !isSearching || d.name.toLowerCase().includes(query) || d.specialty.toLowerCase().includes(query));
  if (isSearching && shown.length === 0) return null;

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("doctor action failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const specialty = newSpecialty.trim();
    await withBusy(async () => {
      await api.doctors.create({ name, specialty, rating: null, language: null, notes: null });
      if (specialty) await api.specialties.ensure([specialty]);
    });
    setNewName("");
    setNewSpecialty("");
    setAdding(false);
  }

  return (
    <CollapsibleManageCard
      title="Doctors"
      subtitle={`${api.doctors.data.length} ${api.doctors.data.length === 1 ? "doctor" : "doctors"}`}
      forceOpen={isSearching}
      bare
    >
      {!isSearching &&
        (adding ? (
          <form onSubmit={handleAdd} className={GROUP_CLS} style={GROUP_STYLE}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Doctor name"
              aria-label="Doctor name"
              maxLength={120}
              className="min-h-11 w-full bg-transparent px-3.5 text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            <div className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
              <span className="w-20 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                Specialty
              </span>
              <div className="min-w-0 flex-1">
                <ComboBox value={newSpecialty} onChange={setNewSpecialty} options={specialtyOptions} placeholder="Specialty" accent={accent} />
              </div>
            </div>
            <div className="flex min-h-11 items-center justify-between px-3.5">
              <button type="button" onClick={() => setAdding(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                Cancel
              </button>
              <button type="submit" disabled={!newName.trim() || busy} className="min-h-11 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                Add doctor
              </button>
            </div>
          </form>
        ) : (
          <div className={GROUP_CLS} style={GROUP_STYLE}>
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--ui-accent)" }}>
              Add doctor
            </button>
          </div>
        ))}

      {api.doctors.data.length === 0 ? (
        <GroupNote>No doctors yet — add one above, or while logging an appointment.</GroupNote>
      ) : (
        <ul className={GROUP_CLS} style={GROUP_STYLE}>
          {shown.map((doctor) => {
            const visits = api.appointments.data.filter((a) => a.doctorId === doctor.id).length;
            const editing = editingId === doctor.id;
            return (
              <li key={doctor.id}>
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : doctor.id)}
                  className="flex min-h-11 w-full items-center gap-3 px-3.5 py-1 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <DoctorName name={doctor.name} rating={doctor.rating} className="text-sm" />
                    <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {doctor.specialty || "No specialty"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {visits} visit{visits === 1 ? "" : "s"}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--text-muted)" }}><ChevronIcon dir={editing ? "down" : "right"} size={14} /></span>
                </button>

                {editing && (
                  <DoctorEditRow
                    doctor={doctor}
                    specialtyOptions={specialtyOptions}
                    accent={accent}
                    canDelete={visits === 0}
                    onEdit={(patch) => void api.doctors.edit(doctor.id, patch)}
                    onEnsureSpecialty={(name) => void api.specialties.ensure([name])}
                    onDelete={() =>
                      void withBusy(async () => {
                        await api.doctors.remove(doctor.id);
                        setEditingId(null);
                      })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <GroupNote>
        The doctors you can attach an appointment to. Their visit history lives on Health &rarr; Doctors.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

function DoctorEditRow({
  doctor,
  specialtyOptions,
  accent,
  canDelete,
  onEdit,
  onEnsureSpecialty,
  onDelete,
}: {
  doctor: Doctor;
  specialtyOptions: string[];
  accent: string;
  canDelete: boolean;
  onEdit: (patch: DoctorPatch) => void;
  onEnsureSpecialty: (name: string) => void;
  onDelete: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(doctor.name);
  const [notesDraft, setNotesDraft] = useState(doctor.notes ?? "");

  function commitName() {
    const next = nameDraft.trim();
    if (next && next !== doctor.name) onEdit({ name: next });
    else setNameDraft(doctor.name);
  }

  function commitNotes() {
    const next = notesDraft.trim();
    if (next !== (doctor.notes ?? "")) onEdit({ notes: next || null });
  }

  const labelCls = "w-20 shrink-0 text-sm";
  return (
    <div className="inset-rows border-t" style={{ borderColor: "var(--gridline)", background: "color-mix(in oklab, var(--page-plane) 55%, var(--surface-1))" }}>
      <label className="flex min-h-11 items-center gap-3 px-3.5">
        <span className={labelCls} style={{ color: "var(--text-primary)" }}>
          Name
        </span>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          maxLength={120}
          className={FIELD_VALUE}
          style={FIELD_VALUE_STYLE}
        />
      </label>
      <div className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
        <span className={labelCls} style={{ color: "var(--text-primary)" }}>
          Specialty
        </span>
        <div className="min-w-0 flex-1">
          <ComboBox
            value={doctor.specialty}
            onChange={(specialty) => {
              onEdit({ specialty });
              if (specialty.trim()) onEnsureSpecialty(specialty.trim());
            }}
            options={specialtyOptions}
            placeholder="Specialty"
            accent={accent}
          />
        </div>
      </div>
      <div className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
        <span className={labelCls} style={{ color: "var(--text-primary)" }}>
          Rating
        </span>
        <div className="flex min-w-0 flex-1 justify-end">
          <RatingChips value={doctor.rating} onChange={(rating) => onEdit({ rating })} accent={accent} />
        </div>
      </div>
      <div className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
        <span className={labelCls} style={{ color: "var(--text-primary)" }}>
          Language
        </span>
        <div className="flex min-w-0 flex-1 justify-end">
          <LanguageChips value={doctor.language} onChange={(language) => onEdit({ language })} accent={accent} />
        </div>
      </div>
      <label className="flex flex-col gap-1 px-3.5 py-2.5">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          Notes
        </span>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={commitNotes}
          rows={2}
          placeholder="Anything worth remembering about them"
          className="resize-y bg-transparent text-sm outline-none"
          style={{ color: "var(--text-secondary)" }}
        />
      </label>
      <div className="flex min-h-11 items-center px-3.5">
        <DoctorDeleteButton
          disabled={!canDelete}
          hint={!canDelete ? "Delete their appointments first" : undefined}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function DoctorDeleteButton({ disabled, hint, onDelete }: { disabled: boolean; hint?: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (disabled) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    );
  }
  return confirming ? (
    <span className="flex items-center gap-4">
      <button type="button" onClick={onDelete} className="min-h-11 text-sm font-semibold" style={{ color: "var(--status-critical)" }}>
        Delete doctor
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-sm" style={{ color: "var(--status-critical)" }}>
      Delete doctor
    </button>
  );
}

// --- Food products ----------------------------------------------------

function FoodProductsCard({
  searchQuery,
  foodItems,
  onResolveIngredient,
}: {
  searchQuery: string;
  foodItems: ManageableItem[];
  onResolveIngredient: (name: string) => Promise<string>;
}) {
  const products = useFoodProducts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const accent = "var(--ui-accent)";

  const shown = products.data.filter((p) => !isSearching || p.name.toLowerCase().includes(query) || (p.brand ?? "").toLowerCase().includes(query));
  if (isSearching && shown.length === 0) return null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const created = await products.create({ name, brand: null, ingredientItemIds: [] });
    setNewName("");
    setAdding(false);
    if (created) setEditingId(created.id);
  }

  return (
    <CollapsibleManageCard
      title="Food products"
      subtitle={`${products.data.length} ${products.data.length === 1 ? "product" : "products"}`}
      forceOpen={isSearching}
      bare
    >
      {!isSearching &&
        (adding ? (
          <form onSubmit={handleAdd} className={GROUP_CLS} style={GROUP_STYLE}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Product name, e.g. Green smoothie"
              aria-label="Product name"
              maxLength={120}
              className="min-h-11 w-full bg-transparent px-3.5 text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            <div className="flex min-h-11 items-center justify-between px-3.5">
              <button type="button" onClick={() => setAdding(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                Cancel
              </button>
              <button type="submit" disabled={!newName.trim()} className="min-h-11 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                Add product
              </button>
            </div>
          </form>
        ) : (
          <div className={GROUP_CLS} style={GROUP_STYLE}>
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--ui-accent)" }}>
              Add product
            </button>
          </div>
        ))}

      {products.data.length === 0 ? (
        <GroupNote>No products yet — add one above, e.g. a bought smoothie or meal with a fixed set of ingredients.</GroupNote>
      ) : (
        <ul className={GROUP_CLS} style={GROUP_STYLE}>
          {shown.map((product) => {
            const editing = editingId === product.id;
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : product.id)}
                  className="flex min-h-11 w-full items-center gap-3 px-3.5 py-1 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {product.name}
                    </span>
                    {product.brand && (
                      <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        {product.brand}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {product.ingredientItemIds.length} ingredient{product.ingredientItemIds.length === 1 ? "" : "s"}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--text-muted)" }}><ChevronIcon dir={editing ? "down" : "right"} size={14} /></span>
                </button>

                {editing && (
                  <ProductEditRow
                    product={product}
                    foodItems={foodItems}
                    accent={accent}
                    onEdit={(patch) => void products.edit(product.id, patch)}
                    onResolveIngredient={onResolveIngredient}
                    onDelete={() =>
                      void (async () => {
                        await products.remove(product.id);
                        setEditingId(null);
                      })()
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <GroupNote>
        A product bundles several Food ingredients under one name — logging it on Log &rarr; Food logs every ingredient at once,
        tagged with the product they came from.
      </GroupNote>
    </CollapsibleManageCard>
  );
}

function ProductEditRow({
  product,
  foodItems,
  accent,
  onEdit,
  onResolveIngredient,
  onDelete,
}: {
  product: FoodProduct;
  foodItems: ManageableItem[];
  accent: string;
  onEdit: (patch: FoodProductPatch) => void;
  onResolveIngredient: (name: string) => Promise<string>;
  onDelete: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(product.name);
  const [brandDraft, setBrandDraft] = useState(product.brand ?? "");
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Newly-created ingredients by this row, keyed by id — a fallback for the
  // chip label ahead of `foodItems` catching up with the item this row just
  // created (that list is owned by the Manage page and only refreshes after
  // its own async reload settles).
  const [justAddedNames, setJustAddedNames] = useState<Map<string, string>>(new Map());
  const nameById = useMemo(() => new Map(foodItems.map((i) => [i.itemIdentity, i.item])), [foodItems]);

  function commitName() {
    const next = nameDraft.trim();
    if (next && next !== product.name) onEdit({ name: next });
    else setNameDraft(product.name);
  }

  function commitBrand() {
    const next = brandDraft.trim();
    if (next !== (product.brand ?? "")) onEdit({ brand: next || null });
  }

  async function addIngredient(name: string) {
    setIngredientDraft("");
    const trimmed = name.trim();
    if (!trimmed) return;
    const itemId = await onResolveIngredient(trimmed);
    setJustAddedNames((prev) => new Map(prev).set(itemId, trimmed));
    if (!product.ingredientItemIds.includes(itemId)) onEdit({ ingredientItemIds: [...product.ingredientItemIds, itemId] });
  }

  function removeIngredient(itemId: string) {
    onEdit({ ingredientItemIds: product.ingredientItemIds.filter((id) => id !== itemId) });
  }

  return (
    <div className="inset-rows border-t" style={{ borderColor: "var(--gridline)", background: "color-mix(in oklab, var(--page-plane) 55%, var(--surface-1))" }}>
      <label className="flex min-h-11 items-center gap-3 px-3.5">
        <span className="w-16 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
          Name
        </span>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          maxLength={120}
          className={FIELD_VALUE}
          style={FIELD_VALUE_STYLE}
        />
      </label>
      <label className="flex min-h-11 items-center gap-3 px-3.5">
        <span className="w-16 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
          Brand
        </span>
        <input
          value={brandDraft}
          onChange={(e) => setBrandDraft(e.target.value)}
          onBlur={commitBrand}
          maxLength={120}
          placeholder="Optional"
          className={FIELD_VALUE}
          style={FIELD_VALUE_STYLE}
        />
      </label>

      {product.ingredientItemIds.map((itemId) => (
        <div key={itemId} className="flex min-h-11 items-center gap-3 px-3.5">
          <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
            {nameById.get(itemId) ?? justAddedNames.get(itemId) ?? "Unknown item"}
          </span>
          <button
            type="button"
            onClick={() => removeIngredient(itemId)}
            aria-label="Remove ingredient"
            className="tap-target flex h-7 w-7 shrink-0 items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
      <div className="px-3.5 py-2">
        <ComboBox
          value={ingredientDraft}
          onChange={(name) => void addIngredient(name)}
          options={foodItems.map((i) => i.item)}
          placeholder="Add an ingredient…"
          accent={accent}
        />
      </div>

      <div className="flex min-h-11 items-center px-3.5">
        {confirming ? (
          <span className="flex items-center gap-4">
            <button type="button" onClick={onDelete} className="min-h-11 text-sm font-semibold" style={{ color: "var(--status-critical)" }}>
              Delete product
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-sm" style={{ color: "var(--status-critical)" }}>
            Delete product
          </button>
        )}
      </div>
    </div>
  );
}

const TYPE_SECTIONS: { type: ItemType; label: string; placeholder: string }[] = [
  { type: "food", label: "Food", placeholder: "e.g. Kohlrabi" },
  { type: "habit", label: "Habits", placeholder: "e.g. Stretch before bed" },
  { type: "supplement", label: "Supplements", placeholder: "e.g. Vitamin B12" },
  { type: "outcome", label: "Symptoms", placeholder: "e.g. Joint pain" },
  { type: "workout", label: "Workout", placeholder: "e.g. Running" },
];

/** Display list for a type's category picker — same rule for all four
 * types, food included. Once this type has any real `categories` rows,
 * those rows ARE the list — full stop, so removing a default sticks
 * instead of reappearing. A type with no rows yet (nothing's ever
 * referenced one of its categories) falls back to the built-in defaults;
 * the first time anything actually uses one (`ensureCategoryId`), the
 * whole default set gets materialized into real rows at once, so this
 * flips from "showing defaults" to "showing rows" without ever narrowing
 * down to just the one category that happened to trigger it. */
function displayCategoryNames(itemType: ItemType, rows: RawCategory[]): string[] {
  const used = rows.filter((r) => r.itemType === itemType).map((r) => r.name);
  if (used.length > 0) return used.sort((a, b) => a.localeCompare(b));
  return [...CATEGORIES_BY_TYPE[itemType]];
}

/** Borderless, right-aligned value that sits in an EditorField row. */
const FIELD_VALUE = "min-w-0 flex-1 bg-transparent py-2 text-right text-sm outline-none disabled:opacity-40 [text-align-last:right]";
const FIELD_VALUE_STYLE = { color: "var(--text-secondary)" } as const;

function AddItemForm({
  itemType,
  placeholder,
  categories,
  onAdd,
}: {
  itemType: ItemType;
  placeholder: string;
  categories: readonly string[];
  onAdd: (name: string, category: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  // Food can often guess its own category from the name; every other type
  // has no classifier to guess from, so it always asks.
  const needsCategory = useMemo(() => {
    if (!trimmed) return false;
    if (itemType === "food") return !lookupFoodCategory(trimmed, categories);
    return true;
  }, [trimmed, itemType, categories]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    const added = await onAdd(trimmed, category);
    if (added) {
      setName("");
      setCategory("");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="inset-rows flex flex-col rounded-xl" style={{ background: "var(--surface-1)" }}>
      <div className="flex min-h-11 items-center gap-2 px-3.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={`New ${itemType} name`}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={!trimmed || busy}
          className="shrink-0 py-2 pl-2 text-sm font-semibold disabled:opacity-40"
          style={{ color: "var(--ui-accent)" }}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {needsCategory && (
        <label className="flex min-h-11 items-center gap-3 px-3.5">
          <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
            Category
          </span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD_VALUE} style={FIELD_VALUE_STYLE}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
    </form>
  );
}

/** Add/remove which categories a type offers, and give each one a custom
 * icon/colour (shown here only — Log and Trends keep their built-in look). */
function CategoryManager({
  categories,
  appearanceByName,
  typeAccent,
  onAddCategory,
  onRemoveCategory,
  onSetAppearance,
}: {
  categories: readonly string[];
  appearanceByName: Map<string, { icon: string | null; color: string | null }>;
  typeAccent: string;
  onAddCategory: (name: string) => Promise<void>;
  onRemoveCategory: (name: string) => Promise<void>;
  onSetAppearance: (name: string, appearance: { icon: string | null; color: string | null }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    await onAddCategory(trimmed);
    setName("");
    setBusy(false);
  }

  const appearanceFor = (c: string) => appearanceByName.get(normalizeName(c)) ?? { icon: null, color: null };
  const accentFor = (c: string) => customColorValue(appearanceFor(c).color) ?? typeAccent;

  return (
    <div className="rounded-xl" style={{ background: "var(--surface-1)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          Categories
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
          {categories.length}
          <ChevronIcon dir={open ? "down" : "right"} size={14} />
        </span>
      </button>
      {open && (
        <ul className="inset-rows border-t" style={{ borderColor: "var(--gridline)" }}>
          {categories.map((c) => {
            const { icon } = appearanceFor(c);
            return (
              <li key={c} className="px-3.5">
                <div className="flex min-h-11 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => (prev === c ? null : c))}
                    aria-label={`Change ${c}'s icon and colour`}
                    aria-pressed={expanded === c}
                    className="tap-target flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ color: accentFor(c), background: `color-mix(in oklab, ${accentFor(c)} 14%, transparent)` }}
                  >
                    <CustomIcon icon={icon} size={15} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {c}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onRemoveCategory(c)}
                    aria-label={`Remove category ${c}`}
                    className="tap-target flex h-7 w-7 shrink-0 items-center justify-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <CloseIcon size={13} />
                  </button>
                </div>
                {expanded === c && (
                  <div className="pb-3">
                    <IconColorPicker
                      icon={appearanceFor(c).icon}
                      color={appearanceFor(c).color}
                      onIconChange={(next) => void onSetAppearance(c, { ...appearanceFor(c), icon: next })}
                      onColorChange={(color) => void onSetAppearance(c, { ...appearanceFor(c), color })}
                      accent={accentFor(c)}
                    />
                  </div>
                )}
              </li>
            );
          })}
          <li>
            <form onSubmit={handleSubmit} className="flex min-h-11 items-center gap-2 px-3.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New category"
                aria-label="New category name"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              <button type="submit" disabled={!name.trim() || busy} className="shrink-0 py-2 pl-2 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                Add
              </button>
            </form>
          </li>
        </ul>
      )}
    </div>
  );
}

/** A catalog suggestion (src/taxonomy/polandFoodCatalog.ts) with no real
 * `food_items` row yet — `item.itemIdentity` is the empty-string sentinel
 * the Log page already uses for the same case. Nothing to rename, archive,
 * or recategorize (there's no row to touch), so this is just a name + a
 * one-click way to stop being offered it — clicking Hide materializes it
 * (creates the row) and archives it in the same step. */
function CatalogFoodRow({ item, busy, onHide }: { item: ManageableItem; busy: boolean; onHide: () => void }) {
  return (
    <li className="flex min-h-11 items-center gap-2 px-3">
      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
        {item.item}
      </span>
      <button
        type="button"
        onClick={onHide}
        disabled={busy}
        className="tap-target shrink-0 px-1 text-sm disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
      >
        Hide
      </button>
    </li>
  );
}

const CUSTOM_UNIT_SENTINEL = "__custom__";

/** Same interaction shape as the category `<select>` next to it — pick
 * from what's already in use with one click — with a "Custom…" escape
 * hatch for a genuinely new unit, since units are free text (see
 * WORKOUT_UNITS' own comment), not a fixed list a `<select>` alone could
 * ever fully cover. Replaces the old free-text-input-with-a-datalist,
 * which looked and behaved nothing like every other picker on this page. */
function UnitSelect({
  unit,
  knownUnits,
  busy,
  onSetUnit,
  itemName,
}: {
  unit: WorkoutUnit;
  knownUnits: WorkoutUnit[];
  busy: boolean;
  onSetUnit: (unit: WorkoutUnit) => void;
  itemName: string;
}) {
  const [customEntry, setCustomEntry] = useState<string | null>(null);
  const options = knownUnits.includes(unit) ? knownUnits : [...knownUnits, unit].sort((a, b) => a.localeCompare(b));

  if (customEntry !== null) {
    return (
      <input
        autoFocus
        value={customEntry}
        disabled={busy}
        onChange={(e) => setCustomEntry(e.target.value)}
        onBlur={() => {
          const trimmed = customEntry.trim();
          setCustomEntry(null);
          if (trimmed && trimmed !== unit) onSetUnit(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setCustomEntry(null);
        }}
        placeholder="e.g. laps"
        aria-label={`Custom unit for ${itemName}`}
        className={FIELD_VALUE}
        style={{ color: "var(--ui-accent)" }}
      />
    );
  }

  return (
    <select
      value={unit}
      disabled={busy}
      onChange={(e) => {
        if (e.target.value === CUSTOM_UNIT_SENTINEL) setCustomEntry("");
        else onSetUnit(e.target.value);
      }}
      aria-label={`Unit for ${itemName}`}
      className={FIELD_VALUE}
      style={FIELD_VALUE_STYLE}
    >
      {options.map((u) => (
        <option key={u} value={u}>
          {workoutUnitLabel(u)}
        </option>
      ))}
      <option value={CUSTOM_UNIT_SENTINEL}>Custom…</option>
    </select>
  );
}

/** Corrects the Food dashboard's automatic nutrition-group classification
 * (src/taxonomy/nutritionGroups.ts) for one food — for the occasional case
 * where the keyword match misses an ingredient entirely or picks the wrong
 * group. "Auto" clears the override and reverts to the keyword lookup,
 * shown here so the current automatic result is visible before deciding
 * whether to override it. */
function NutritionGroupSelect({
  itemName,
  override,
  busy,
  onSetNutritionGroup,
}: {
  itemName: string;
  override: NutritionGroupId | undefined;
  busy: boolean;
  onSetNutritionGroup: (groupId: NutritionGroupId | null) => void;
}) {
  const autoGroups = useMemo(() => nutritionGroupsForFood(itemName), [itemName]);
  const autoLabel = autoGroups.length > 0 ? autoGroups.map((g) => NUTRITION_GROUP_LABEL[g]).join(", ") : "unclassified";

  return (
    <select
      value={override ?? ""}
      disabled={busy}
      onChange={(e) => onSetNutritionGroup(e.target.value ? (e.target.value as NutritionGroupId) : null)}
      aria-label={`Nutrition group for ${itemName}`}
      className={FIELD_VALUE}
      style={{ color: override ? "var(--ui-accent)" : "var(--text-secondary)" }}
    >
      <option value="">Auto ({autoLabel})</option>
      {NUTRITION_GROUPS.map((g) => (
        <option key={g} value={g}>
          {NUTRITION_GROUP_LABEL[g]}
        </option>
      ))}
    </select>
  );
}

/** A label on the left and its value on the right — one row per field in
 * an expanded item, like a Settings form row. */
function EditorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-3 px-3.5">
      <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</span>
    </label>
  );
}

/** One tracked item: a single tappable line (name, short summary, chevron)
 * that opens its editor — rename, category, per-type settings, archive and
 * delete — right below it. Keeping every control behind the tap is what
 * lets a 150-item list stay a tidy column instead of a wall of pills. */
function ItemRow({
  item,
  itemType,
  categories,
  showCategory,
  linkedDecisions,
  busy,
  onArchiveToggle,
  onRename,
  onChangeCategory,
  onHideCatalog,
  onSetReminderTime,
  onSetUnit,
  knownUnits,
  nutritionGroupOverride,
  onSetNutritionGroup,
  onDelete,
}: {
  item: ManageableItem;
  itemType: ItemType;
  categories: readonly string[] | null;
  /** Show the category as the row's summary — only when the list isn't
   * already grouped by it. */
  showCategory?: boolean;
  /** Supplement only — decision entries explaining this item, newest first. */
  linkedDecisions?: CareEntry[];
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
  onChangeCategory?: (newCategory: string) => void;
  onHideCatalog?: () => void;
  onSetReminderTime?: (time: string | null) => void;
  onSetUnit?: (unit: WorkoutUnit) => void;
  knownUnits?: WorkoutUnit[];
  /** Food only — the current per-user override, if any (undefined means
   * automatic keyword classification). */
  nutritionGroupOverride?: NutritionGroupId;
  onSetNutritionGroup?: (groupId: NutritionGroupId | null) => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(item.item);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (item.itemIdentity === "" && onHideCatalog) {
    return <CatalogFoodRow item={item} busy={busy} onHide={onHideCatalog} />;
  }
  const canRemind = onSetReminderTime && (itemType === "supplement" || itemType === "habit");
  const canSetUnit = onSetUnit && itemType === "workout";
  const canSetNutritionGroup = onSetNutritionGroup && itemType === "food";
  // Delete is only ever offered for an item with zero logged history — see
  // ManageableItem.hasHistory's doc comment for why (an item with any
  // history can't be hard-deleted, only archived).
  const canDelete = item.hasHistory === false && onDelete;

  const summary =
    (canRemind && item.reminderTime) ||
    (canSetUnit && workoutUnitLabel(item.unit ?? "kg")) ||
    (nutritionGroupOverride && NUTRITION_GROUP_LABEL[nutritionGroupOverride]) ||
    (showCategory ? item.category : "");

  function saveName(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (next && next !== item.item) onRename(next);
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          setDraft(item.item);
          setConfirmingDelete(false);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
          {item.item}
        </span>
        {summary && (
          <span className="shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
            {summary}
          </span>
        )}
        <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
          <ChevronIcon dir={open ? "down" : "right"} size={14} />
        </span>
      </button>

      {open && (
        <div className="inset-rows border-t" style={{ borderColor: "var(--gridline)", background: "color-mix(in oklab, var(--page-plane) 55%, var(--surface-1))" }}>
          <form onSubmit={saveName} className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
              Name
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Rename ${item.item}`}
              className={FIELD_VALUE}
              style={FIELD_VALUE_STYLE}
            />
            {draft.trim() && draft.trim() !== item.item && (
              <button type="submit" disabled={busy} className="shrink-0 py-2 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                Save
              </button>
            )}
          </form>

          {categories && onChangeCategory && (
            <EditorField label="Category">
              <select value={item.category} disabled={busy} onChange={(e) => onChangeCategory(e.target.value)} className={FIELD_VALUE} style={FIELD_VALUE_STYLE}>
                {!categories.includes(item.category) && <option value={item.category}>{item.category}</option>}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </EditorField>
          )}
          {canSetNutritionGroup && (
            <EditorField label="Nutrition">
              <NutritionGroupSelect itemName={item.item} override={nutritionGroupOverride} busy={busy} onSetNutritionGroup={onSetNutritionGroup} />
            </EditorField>
          )}
          {canSetUnit && (
            <EditorField label="Unit">
              <UnitSelect unit={item.unit ?? "kg"} knownUnits={knownUnits ?? []} busy={busy} onSetUnit={onSetUnit} itemName={item.item} />
            </EditorField>
          )}
          {canRemind && (
            <EditorField label="Reminder">
              <input
                type="time"
                value={item.reminderTime ?? ""}
                disabled={busy}
                onChange={(e) => onSetReminderTime(e.target.value || null)}
                aria-label={`Reminder time for ${item.item}`}
                className={FIELD_VALUE}
                style={FIELD_VALUE_STYLE}
              />
              {item.reminderTime && (
                <button
                  type="button"
                  onClick={() => onSetReminderTime(null)}
                  disabled={busy}
                  className="shrink-0 text-sm font-medium disabled:opacity-40"
                  style={{ color: "var(--ui-accent)" }}
                >
                  Clear
                </button>
              )}
            </EditorField>
          )}
          {linkedDecisions && linkedDecisions.length > 0 && (
            <div className="px-3.5 py-2.5">
              <SupplementWhyLine decisions={linkedDecisions} />
            </div>
          )}

          <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
            <button
              type="button"
              onClick={onArchiveToggle}
              disabled={busy}
              className="min-h-11 text-sm disabled:opacity-40"
              style={{ color: "var(--ui-accent)" }}
            >
              {item.isArchived ? "Unarchive" : "Archive"}
            </button>
            {canDelete &&
              (confirmingDelete ? (
                <span className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      onDelete();
                    }}
                    className="min-h-11 text-sm font-semibold"
                    style={{ color: "var(--status-critical)" }}
                  >
                    Delete for good
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                  className="min-h-11 text-sm disabled:opacity-40"
                  style={{ color: "var(--status-critical)" }}
                >
                  Delete
                </button>
              ))}
          </div>
        </div>
      )}
    </li>
  );
}

/** The "why am I taking this" line under a supplement row — the latest
 * linked care-log decision's title, its reasoning on demand, and a count
 * of any older ones. Read-only; decisions are edited in Health → Visits. */
function SupplementWhyLine({ decisions }: { decisions: CareEntry[] }) {
  const [open, setOpen] = useState(false);
  const [latest, ...earlier] = decisions;
  return (
    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
      <button
        type="button"
        onClick={() => latest.body && setOpen((v) => !v)}
        className="flex items-start gap-1 text-left"
        aria-expanded={latest.body ? open : undefined}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-muted)" }}>Why: </span>
          {latest.title}
        </span>
        {latest.body && <ChevronIcon dir={open ? "up" : "down"} size={12} />}
      </button>
      {open && latest.body && (
        <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {latest.body}
        </p>
      )}
      {earlier.length > 0 && (
        <span className="mt-0.5 block">
          +{earlier.length} earlier decision{earlier.length > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

/** Above this many active items a type's list is grouped by category,
 * each group collapsed — a long flat list is the thing to avoid. */
const GROUP_THRESHOLD = 12;

function ItemSection({
  itemType,
  label,
  placeholder,
  items,
  categories,
  decisionsBySupplementId,
  searchQuery,
  busyIdentity,
  onToggleArchive,
  onRename,
  onChangeCategory,
  onAdd,
  onAddCategory,
  onRemoveCategory,
  onSetCategoryAppearance,
  categoryAppearanceByName,
  onHideCatalogFood,
  onSetReminderTime,
  onSetUnit,
  nutritionGroupOverrides,
  onSetNutritionGroup,
  onDelete,
}: {
  itemType: ItemType;
  label: string;
  placeholder: string;
  items: ManageableItem[];
  categories: readonly string[];
  /** Supplement section only — decision care-log entries keyed by supplement id. */
  decisionsBySupplementId?: Map<string, CareEntry[]>;
  searchQuery: string;
  busyIdentity: string | null;
  onToggleArchive: (item: ManageableItem) => void;
  onRename: (item: ManageableItem, name: string) => void;
  onChangeCategory: (item: ManageableItem, category: string) => void;
  onAdd: (name: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => Promise<void>;
  onRemoveCategory: (name: string) => Promise<void>;
  onSetCategoryAppearance: (name: string, appearance: { icon: string | null; color: string | null }) => Promise<void>;
  categoryAppearanceByName: Map<string, { icon: string | null; color: string | null }>;
  /** Food only — materializes a catalog-only suggestion as a real,
   * archived item so it stops being offered on the Log page. */
  onHideCatalogFood?: (name: string, category: string) => Promise<void>;
  /** Supplement/habit only — set from the Manage page, absent everywhere
   * else, gated inside ItemRow. */
  onSetReminderTime?: (item: ManageableItem, time: string | null) => void;
  /** Workout only — set from the Manage page, absent everywhere else,
   * gated inside ItemRow. */
  onSetUnit?: (item: ManageableItem, unit: WorkoutUnit) => void;
  /** Food only — current overrides keyed by normalized item name, and the
   * setter (`null` clears back to automatic), both gated inside ItemRow. */
  nutritionGroupOverrides?: Record<string, NutritionGroupId>;
  onSetNutritionGroup?: (item: ManageableItem, groupId: NutritionGroupId | null) => void;
  onDelete: (item: ManageableItem) => void;
}) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [localQuery, setLocalQuery] = useState("");
  const globalQuery = searchQuery.trim().toLowerCase();
  const mode = useSectionMode(label, globalQuery.length > 0);
  const query = globalQuery || localQuery.trim().toLowerCase();
  const isFiltering = query.length > 0;
  const matches = (i: ManageableItem) => i.item.toLowerCase().includes(query);

  const active = items
    .filter((i) => !i.isArchived && (!isFiltering || matches(i)))
    .sort((a, b) => a.item.localeCompare(b.item));
  const archived = items
    .filter((i) => i.isArchived && (!isFiltering || matches(i)))
    .sort((a, b) => a.item.localeCompare(b.item));
  const activeCount = items.filter((i) => !i.isArchived).length;
  const archivedCount = items.length - activeCount;

  // Every unit already in play across this type's items, plus the built-in
  // starting suggestions — the select offers all of them so picking a unit
  // someone else's exercise already uses is one tap, same as picking an
  // existing category. Units aren't first-class rows (unlike categories),
  // so this is derived from usage rather than a stored list.
  const knownUnits =
    itemType === "workout"
      ? Array.from(new Set([...WORKOUT_UNITS, ...items.map((i) => i.unit).filter((u): u is WorkoutUnit => Boolean(u))])).sort((a, b) => a.localeCompare(b))
      : [];

  if (mode === "hidden") return null;
  if (globalQuery && active.length === 0 && archived.length === 0) return null;
  if (mode === "row") {
    return <SectionRow title={label} subtitle={`${activeCount} active${archivedCount > 0 ? ` · ${archivedCount} archived` : ""}`} />;
  }

  const groups = new Map<string, ManageableItem[]>();
  for (const item of active) {
    const list = groups.get(item.category);
    if (list) list.push(item);
    else groups.set(item.category, [item]);
  }
  const grouped = items.filter((i) => !i.isArchived).length > GROUP_THRESHOLD;
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  function toggleCategory(category: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function renderRow(item: ManageableItem, opts: { archivedRow?: boolean } = {}) {
    return (
      <ItemRow
        key={item.itemIdentity || `catalog:${item.item}`}
        item={item}
        itemType={itemType}
        categories={categories}
        showCategory={!grouped || opts.archivedRow}
        linkedDecisions={decisionsBySupplementId?.get(item.itemIdentity)}
        busy={item.itemIdentity !== "" && busyIdentity === item.itemIdentity}
        onArchiveToggle={() => onToggleArchive(item)}
        onRename={(name) => onRename(item, name)}
        onChangeCategory={(category) => onChangeCategory(item, category)}
        onHideCatalog={!opts.archivedRow && onHideCatalogFood ? () => void onHideCatalogFood(item.item, item.category) : undefined}
        onSetReminderTime={onSetReminderTime ? (time) => onSetReminderTime(item, time) : undefined}
        onSetUnit={onSetUnit ? (unit) => onSetUnit(item, unit) : undefined}
        knownUnits={knownUnits}
        nutritionGroupOverride={nutritionGroupOverrides?.[normalizeName(item.item)]}
        onSetNutritionGroup={onSetNutritionGroup ? (groupId) => onSetNutritionGroup(item, groupId) : undefined}
        onDelete={() => onDelete(item)}
      />
    );
  }

  const listBox = "inset-rows rounded-xl";
  const listBoxStyle = { background: "var(--surface-1)" } as const;

  return (
    <div className="flex flex-col gap-1.5">
      {mode === "inline" && (
        <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          {label}
        </h3>
      )}
      <div className="flex flex-col gap-4">
        {mode === "detail" && <SearchField value={localQuery} onChange={setLocalQuery} placeholder={`Search ${label.toLowerCase()}…`} className="w-full" />}

        <AddItemForm itemType={itemType} placeholder={placeholder} categories={categories} onAdd={onAdd} />

        {active.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {isFiltering ? "No match." : "Nothing tracked yet."}
          </p>
        ) : grouped ? (
          <div className={listBox} style={listBoxStyle}>
            {sortedGroups.map(([category, rows]) => {
              const groupOpen = isFiltering || openCategories.has(category);
              return (
                <div key={category}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    disabled={isFiltering}
                    aria-expanded={groupOpen}
                    className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
                  >
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {category}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                      {rows.length}
                      {!isFiltering && <ChevronIcon dir={groupOpen ? "down" : "right"} size={14} />}
                    </span>
                  </button>
                  {groupOpen && <ul className="inset-rows border-t" style={{ borderColor: "var(--gridline)" }}>{rows.map((item) => renderRow(item))}</ul>}
                </div>
              );
            })}
          </div>
        ) : (
          <ul className={listBox} style={listBoxStyle}>
            {active.map((item) => renderRow(item))}
          </ul>
        )}

        {archived.length > 0 && (
          <div className={listBox} style={listBoxStyle}>
            <button
              type="button"
              onClick={() => setArchivedOpen((v) => !v)}
              disabled={isFiltering}
              aria-expanded={isFiltering || archivedOpen}
              className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left"
            >
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Archived
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                {archived.length}
                {!isFiltering && <ChevronIcon dir={archivedOpen ? "down" : "right"} size={14} />}
              </span>
            </button>
            {(isFiltering || archivedOpen) && (
              <ul className="inset-rows border-t opacity-70" style={{ borderColor: "var(--gridline)" }}>
                {archived.map((item) => renderRow(item, { archivedRow: true }))}
              </ul>
            )}
          </div>
        )}

        {mode === "detail" && (
          <CategoryManager
            categories={categories}
            appearanceByName={categoryAppearanceByName}
            typeAccent={TYPE_ACCENT[itemType]}
            onAddCategory={onAddCategory}
            onRemoveCategory={onRemoveCategory}
            onSetAppearance={onSetCategoryAppearance}
          />
        )}
      </div>
    </div>
  );
}

function toManageable(item: RawItem, itemsWithHistory: Set<string>): ManageableItem {
  return {
    itemIdentity: item.identity,
    item: item.rawName,
    category: item.category,
    isArchived: item.isArchived,
    reminderTime: item.reminderTime,
    unit: item.unit,
    hasHistory: itemsWithHistory.has(item.identity),
  };
}

export default function ManagePage() {
  const { status, isDemoData, refresh: refreshShared } = useData();
  const careLog = useCareLog();
  const [rawItems, setRawItems] = useState<RawItem[] | null>(null);
  const [categoryRows, setCategoryRows] = useState<RawCategory[]>([]);
  // Item identities with at least one log/diary entry — an item in this
  // set can only be archived, never hard-deleted (see
  // getItemIdentitiesWithHistory's doc comment). Empty in demo mode: the
  // demo dataset's items are all in-memory anyway, so Delete there is
  // always safe and harmless.
  const [itemsWithHistory, setItemsWithHistory] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // The section open as its own screen; `null` is the list of sections.
  // Each open pushes a history entry so the phone's back gesture returns to
  // the list rather than leaving Settings.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const openSection = useCallback((title: string) => {
    window.history.pushState({ ...window.history.state, manageSection: title }, "");
    setActiveSection(title);
    window.scrollTo(0, 0);
  }, []);
  const closeSection = useCallback(() => {
    if (window.history.state?.manageSection) window.history.back();
    else setActiveSection(null);
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setActiveSection(e.state?.manageSection ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [actionError, setActionError] = useState<string | null>(null);
  // Set when Add matches an existing item's name (active or archived) —
  // surfaced as a dialog instead of silently either creating a duplicate
  // or (for an archived match) failing to sync against the DB's
  // per-user unique-name constraint.
  const [duplicateConflict, setDuplicateConflict] = useState<{ itemType: ItemType; item: ManageableItem } | null>(null);

  // Demo-mode state — purely in-memory, exactly like buildDemoDataset()
  // itself (see its own doc comment): never written to IndexedDB or
  // Supabase, so it's structurally impossible for it to still be there
  // once someone actually signs in. Seeded once (lazy initializer) from
  // the same deterministic demo dataset every other page shows, so
  // there's something real-looking to add/rename/archive/recategorize
  // interactively without an account.
  const [demoItems, setDemoItems] = useState<RawItem[]>(() => buildDemoDataset().items);
  const [demoCategoryRows, setDemoCategoryRows] = useState<RawCategory[]>([]);
  const [demoBusyIdentity, setDemoBusyIdentity] = useState<string | null>(null);

  // Status-neutral: reads whatever's currently in IndexedDB without
  // touching the shared data status, so the effect below can call this on
  // every status change without looping (see next comment).
  const loadLocalSnapshot = useCallback(async () => {
    // One atomic read against withDataLock — pullFromCloud's destructive
    // clear-and-repopulate is also one withDataLock call (see sync.ts), so
    // this can never land mid-pull and see an empty or half-repopulated
    // cache.
    const [items, categories, withHistory] = await withDataLock(() =>
      Promise.all([getAllItems(), getAllCategories(), getItemIdentitiesWithHistory()]),
    );
    setRawItems(items);
    setCategoryRows(categories);
    setItemsWithHistory(withHistory);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads an external system (IndexedDB) on status change, not a React-state sync loop
    void loadLocalSnapshot();
    // Re-loads whenever the shared data status changes (sign-in pull,
    // initial mount). Deliberately calls the status-neutral snapshot
    // loader here, not the mutation-triggering `refresh` below — `refresh`
    // itself calls `refreshShared`, which cycles `status` through
    // "loading" → a terminal state; if this effect called `refresh` (or
    // anything that touches `refreshShared`) it would re-trigger itself on
    // every one of those transitions and loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const refresh = useCallback(async () => {
    await loadLocalSnapshot();
    await refreshShared();
  }, [loadLocalSnapshot, refreshShared]);

  const {
    busyIdentity: realBusyIdentity,
    toggleArchive: realToggleArchive,
    rename: realRename,
    changeCategory: realChangeCategory,
    setReminderTime: realSetReminderTime,
    setUnit: realSetUnit,
    deleteItem: realDeleteItem,
  } = useItemActions(refresh);

  const {
    overrides: nutritionGroupOverrides,
    setOverride: realSetNutritionGroup,
    clearOverride: realClearNutritionGroup,
  } = useFoodNutritionGroupOverrides();

  const itemsByType = useMemo(() => {
    const map: Record<ItemType, ManageableItem[]> = { food: [], supplement: [], outcome: [], habit: [], workout: [] };
    const source = isDemoData ? demoItems : rawItems;
    if (!source) return map;
    const withHistory = isDemoData ? new Set<string>() : itemsWithHistory;
    for (const it of source) map[it.itemType].push(toManageable(it, withHistory));

    // The Poland food catalog (src/taxonomy/polandFoodCatalog.ts) backs the
    // Log page's "browse foods you haven't logged yet" grid — a name in
    // there has no real `food_items` row until it's either tapped once (Log
    // page) or explicitly hidden (here), so it can't show up any other way
    // in this list. Folded in as itemIdentity "" pseudo-rows — same
    // sentinel the Log page already uses for catalog-only entries — so
    // Hide can materialize + archive it on click, the same
    // materialize-then-act pattern used for removing a never-used default
    // category.
    const knownFoodNames = new Set(map.food.map((i) => normalizeName(i.item)));
    for (const [category, names] of Object.entries(POLAND_FOOD_CATALOG)) {
      for (const name of names) {
        const norm = normalizeName(name);
        if (knownFoodNames.has(norm)) continue;
        knownFoodNames.add(norm);
        map.food.push({ itemIdentity: "", item: name, category, isArchived: false });
      }
    }
    return map;
  }, [isDemoData, demoItems, rawItems, itemsWithHistory]);

  const activeCategoryRows = isDemoData ? demoCategoryRows : categoryRows;

  const categoryNamesByType = useMemo(() => {
    const map = {} as Record<ItemType, string[]>;
    for (const section of TYPE_SECTIONS) map[section.type] = displayCategoryNames(section.type, activeCategoryRows);
    return map;
  }, [activeCategoryRows]);

  const categoryAppearanceByType = useMemo(() => {
    const map = {} as Record<ItemType, Map<string, { icon: string | null; color: string | null }>>;
    for (const section of TYPE_SECTIONS) map[section.type] = new Map();
    for (const row of activeCategoryRows) {
      map[row.itemType]?.set(normalizeName(row.name), { icon: row.icon, color: row.color });
    }
    return map;
  }, [activeCategoryRows]);

  // Decision care-log entries linked to a supplement, newest-first per
  // supplement id (careLog.data is already sorted that way). Powers the
  // "why am I taking this" line on the supplement's row.
  const decisionsBySupplementId = useMemo(() => {
    const map = new Map<string, CareEntry[]>();
    for (const e of careLog.data) {
      if (e.kind !== "decision" || !e.supplementItemId) continue;
      const list = map.get(e.supplementItemId);
      if (list) list.push(e);
      else map.set(e.supplementItemId, [e]);
    }
    return map;
  }, [careLog.data]);

  async function handleAdd(itemType: ItemType, name: string, categoryChoice: string): Promise<boolean> {
    const trimmed = titleCaseFallback(name);
    if (!trimmed) return false;
    const existing = itemsByType[itemType].find((i) => i.itemIdentity !== "" && normalizeName(i.item) === normalizeName(trimmed));
    if (existing) {
      setDuplicateConflict({ itemType, item: existing });
      return false;
    }
    // Food still gets a name-based guess as a convenience; every type falls
    // back to whatever the category picker is showing (its first option by
    // default) if nothing more specific applies.
    const guessed = itemType === "food" ? lookupFoodCategory(trimmed, categoryNamesByType.food) : null;
    const category = guessed ?? (categoryChoice || categoryNamesByType[itemType][0]);
    const categoryId = await ensureCategoryId(itemType, category);

    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType,
      rawName: trimmed,
      category,
      categoryId,
      isArchived: false,
      createdDate: todayLocalISODate(),
      reminderTime: null,
      unit: itemType === "workout" ? defaultWorkoutUnitForCategory(category) : null,
    };
    await putItemAndSync(item);
    await refresh();
    return true;
  }

  /** Resolves a typed ingredient name to a real food_items id for a
   * product — reuses whatever already matches by name, or materializes a
   * new item (guessing its category the same way `handleAdd` does) rather
   * than blocking on a duplicate-name dialog, since picking an existing
   * ingredient by typing its name is the expected path here. */
  async function resolveOrCreateFoodIngredient(name: string): Promise<string> {
    const trimmed = titleCaseFallback(name);
    const existing = itemsByType.food.find((i) => i.itemIdentity !== "" && normalizeName(i.item) === normalizeName(trimmed));
    if (existing) return existing.itemIdentity;
    const guessed = lookupFoodCategory(trimmed, categoryNamesByType.food);
    const category = guessed ?? categoryNamesByType.food[0];
    const categoryId = await ensureCategoryId("food", category);
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: "food",
      rawName: trimmed,
      category,
      categoryId,
      isArchived: false,
      createdDate: todayLocalISODate(),
      reminderTime: null,
      unit: null,
    };
    await putItemAndSync(item);
    await refresh();
    return item.identity;
  }

  /** Stops offering a catalog suggestion on the Log page — since there's no
   * real row for it yet, "hide" means creating one and archiving it in the
   * same step, not toggling a flag on something that already exists. */
  async function handleHideCatalogFood(name: string, category: string) {
    const categoryId = await ensureCategoryId("food", category);
    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType: "food",
      rawName: name,
      category,
      categoryId,
      isArchived: true,
      createdDate: todayLocalISODate(),
      reminderTime: null,
      unit: null,
    };
    await putItemAndSync(item);
    await refresh();
  }

  async function handleAddCategory(itemType: ItemType, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await ensureCategoryId(itemType, trimmed);
    await refresh();
  }

  async function handleSetCategoryAppearance(itemType: ItemType, name: string, appearance: { icon: string | null; color: string | null }) {
    await setCategoryAppearanceAndSync(itemType, name, appearance);
    await refresh();
  }

  async function handleRemoveCategory(itemType: ItemType, name: string) {
    setActionError(null);
    // Re-read fresh rather than trusting this page's `itemsByType` state,
    // which only reflects whatever was loaded as of the last `refresh()` —
    // stale enough (e.g. right after adding an item under this category)
    // to let a removal through here that Supabase's `on delete restrict`
    // FK would reject anyway, dead-lettering it silently in the outbox.
    // Catalog-only rows (itemIdentity "") aren't real items yet, so they
    // never block a category removal the way an actually-tracked item does.
    // Locked (rather than a plain getAllItems() call) so this can't land
    // mid-pull and read an empty/half-repopulated items store — see
    // loadLocalSnapshot's own comment above.
    const freshItems = isDemoData ? demoItems : await withDataLock(() => getAllItems());
    const inUse = freshItems.some((i) => i.itemType === itemType && i.category === name);
    if (inUse) {
      setActionError(`"${name}" is still used by at least one ${itemType} item — recategorize those first.`);
      return;
    }
    // A never-used built-in default has no row yet to delete — materialize
    // it (and the rest of that type's defaults, same as any other
    // first-ever use) before removing exactly this one, so the removal
    // actually persists instead of the default just reappearing next render.
    const id = await ensureCategoryId(itemType, name);
    await deleteCategoryAndSync(id);
    await refresh();
  }

  /** Permanently removes an item — only ever reachable when it has no
   * logged history (see ItemRow's `hasHistory === false` gate) and after
   * the row's own Delete/Keep confirm. `deleteItemAndSync` re-verifies that
   * freshly right before deleting and throws if it's since become stale
   * (something logged this item since this page last loaded) — surfaced in
   * the page's error line rather than silently swallowed. */
  async function handleDelete(item: ManageableItem) {
    setActionError(null);
    try {
      await realDeleteItem(item);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete this item — please try again.");
      await refresh();
    }
  }

  // --- Demo-mode equivalents of the handlers above — same shapes, but
  // mutating local state instead of IndexedDB/Supabase. See the demo-state
  // declarations up top for why this never touches real storage. ---

  function demoDeleteItem(item: ManageableItem) {
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.filter((it) => it.identity !== item.itemIdentity));
    setDemoBusyIdentity(null);
  }

  function demoSetUnit(item: ManageableItem, unit: WorkoutUnit) {
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.map((it) => (it.identity === item.itemIdentity ? { ...it, unit } : it)));
    setDemoBusyIdentity(null);
  }

  function demoToggleArchive(item: ManageableItem) {
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.map((it) => (it.identity === item.itemIdentity ? { ...it, isArchived: !it.isArchived } : it)));
    setDemoBusyIdentity(null);
  }

  function demoRename(item: ManageableItem, newName: string) {
    const trimmed = titleCaseFallback(newName);
    if (!trimmed || trimmed === item.item) return;
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.map((it) => (it.identity === item.itemIdentity ? { ...it, rawName: trimmed } : it)));
    setDemoBusyIdentity(null);
  }

  /** Resolves (materializing whatever's missing, demo-state version of
   * `ensureCategoryId`) a category id, folding the seeded rows into
   * `demoCategoryRows` in the same update. */
  function demoEnsureCategoryId(itemType: ItemType, name: string): string {
    const existing = demoCategoryRows.find((c) => c.itemType === itemType && c.name === name);
    if (existing) return existing.id;
    const seeded = categoryRowsToSeedForDemo(itemType, name, demoCategoryRows);
    setDemoCategoryRows((prev) => [...prev, ...seeded]);
    return seeded.find((c) => c.name === name)?.id ?? seeded[0].id;
  }

  function demoChangeCategory(item: ManageableItem, itemType: ItemType, newCategory: string) {
    if (!newCategory || newCategory === item.category) return;
    setDemoBusyIdentity(item.itemIdentity);
    const categoryId = demoEnsureCategoryId(itemType, newCategory);
    setDemoItems((prev) =>
      prev.map((it) => (it.identity === item.itemIdentity ? { ...it, category: newCategory, categoryId } : it)),
    );
    setDemoBusyIdentity(null);
  }

  function demoHandleAdd(itemType: ItemType, name: string, categoryChoice: string): Promise<boolean> {
    const trimmed = titleCaseFallback(name);
    if (!trimmed) return Promise.resolve(false);
    const existing = itemsByType[itemType].find((i) => i.itemIdentity !== "" && normalizeName(i.item) === normalizeName(trimmed));
    if (existing) {
      setDuplicateConflict({ itemType, item: existing });
      return Promise.resolve(false);
    }
    const guessed = itemType === "food" ? lookupFoodCategory(trimmed, categoryNamesByType.food) : null;
    const category = guessed ?? (categoryChoice || categoryNamesByType[itemType][0]);
    const categoryId = demoEnsureCategoryId(itemType, category);
    setDemoItems((prev) => [
      ...prev,
      {
        identity: crypto.randomUUID(),
        itemType,
        rawName: trimmed,
        category,
        categoryId,
        isArchived: false,
        createdDate: todayLocalISODate(),
        reminderTime: null,
        unit: itemType === "workout" ? defaultWorkoutUnitForCategory(category) : null,
      },
    ]);
    return Promise.resolve(true);
  }

  function demoHideCatalogFood(name: string, category: string): Promise<void> {
    const categoryId = demoEnsureCategoryId("food", category);
    setDemoItems((prev) => [
      ...prev,
      {
        identity: crypto.randomUUID(),
        itemType: "food",
        rawName: name,
        category,
        categoryId,
        isArchived: true,
        createdDate: todayLocalISODate(),
        reminderTime: null,
        unit: null,
      },
    ]);
    return Promise.resolve();
  }

  function demoAddCategory(itemType: ItemType, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve();
    demoEnsureCategoryId(itemType, trimmed);
    return Promise.resolve();
  }

  function demoSetCategoryAppearance(itemType: ItemType, name: string, appearance: { icon: string | null; color: string | null }): Promise<void> {
    const id = demoEnsureCategoryId(itemType, name);
    setDemoCategoryRows((prev) => prev.map((c) => (c.id === id ? { ...c, ...appearance } : c)));
    return Promise.resolve();
  }

  function demoRemoveCategory(itemType: ItemType, name: string): Promise<void> {
    setActionError(null);
    if (itemsByType[itemType].some((i) => i.itemIdentity !== "" && i.category === name)) {
      setActionError(`"${name}" is still used by at least one ${itemType} item — recategorize those first.`);
      return Promise.resolve();
    }
    // Same materialize-then-remove as the real handler — a never-used
    // default has no row yet, so it has to be seeded before it can be
    // removed, or the removal wouldn't persist.
    const id = demoEnsureCategoryId(itemType, name);
    setDemoCategoryRows((prev) => prev.filter((c) => c.id !== id));
    return Promise.resolve();
  }

  const busyIdentity = isDemoData ? demoBusyIdentity : realBusyIdentity;

  // Only the initial load blanks the whole page — once `rawItems` has
  // loaded at least once, later `status` flickers (every archive/rename/
  // add/category edit here calls `refreshShared`, which cycles status
  // through "loading" and back) must NOT unmount the page again: doing so
  // was what threw the scroll position back to the top on every action.
  // Demo mode never hits this at all — `demoItems` is seeded synchronously.
  if (!isDemoData && rawItems === null) return <PageSkeleton cards={4} />;
  if (status === "empty" && !isDemoData) return <EmptyState />;

  // Every editable grouping, keyed by its title — the page lays them out in
  // the groups below.
  const manageSections: { label: string; el: ReactNode }[] = [
    { label: "Reminder lists", el: <ReminderListsCard key="reminder-lists" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Doctors", el: <DoctorsCard key="doctors" searchQuery={searchQuery} /> },
    {
      label: "Food products",
      el: (
        <FoodProductsCard
          key="food-products"
          searchQuery={searchQuery}
          foodItems={itemsByType.food.filter((i) => i.itemIdentity !== "")}
          onResolveIngredient={resolveOrCreateFoodIngredient}
        />
      ),
    },
    { label: "Doctor types", el: <DoctorSpecialtiesCard key="doctor-types" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Lab results", el: <LabResultsCard key="lab-results" searchQuery={searchQuery} /> },
    { label: "Stool options", el: <StoolOptionsCard key="stool-options" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Coffee", el: <CoffeeCard key="coffee" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Weight goal", el: <WeightGoalCard key="weight-goal" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Wishlist lists", el: <WishlistListsCard key="wishlist-lists" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    ...TYPE_SECTIONS.map((section) => ({
      label: section.label,
      el: (
        <ItemSection
          key={section.type}
          itemType={section.type}
          label={section.label}
          placeholder={section.placeholder}
          items={itemsByType[section.type]}
          categories={categoryNamesByType[section.type]}
          decisionsBySupplementId={section.type === "supplement" ? decisionsBySupplementId : undefined}
          searchQuery={searchQuery}
          busyIdentity={busyIdentity}
          onToggleArchive={(item) => (isDemoData ? demoToggleArchive(item) : void realToggleArchive(item))}
          onRename={(item, name) => (isDemoData ? demoRename(item, name) : void realRename(item, name))}
          onChangeCategory={(item, category) => {
            if (isDemoData) {
              demoChangeCategory(item, section.type, category);
              return;
            }
            void ensureCategoryId(section.type, category).then((id) => realChangeCategory(item, category, id));
          }}
          onAdd={(name, category) => (isDemoData ? demoHandleAdd(section.type, name, category) : handleAdd(section.type, name, category))}
          onAddCategory={(name) => (isDemoData ? demoAddCategory(section.type, name) : handleAddCategory(section.type, name))}
          onRemoveCategory={(name) => (isDemoData ? demoRemoveCategory(section.type, name) : handleRemoveCategory(section.type, name))}
          categoryAppearanceByName={categoryAppearanceByType[section.type]}
          onSetCategoryAppearance={(name, appearance) =>
            isDemoData ? demoSetCategoryAppearance(section.type, name, appearance) : handleSetCategoryAppearance(section.type, name, appearance)
          }
          onHideCatalogFood={
            section.type === "food" ? (name, category) => (isDemoData ? demoHideCatalogFood(name, category) : handleHideCatalogFood(name, category)) : undefined
          }
          onSetReminderTime={isDemoData ? undefined : (item, time) => void realSetReminderTime(item, time)}
          onSetUnit={(item, unit) => (isDemoData ? demoSetUnit(item, unit) : void realSetUnit(item, unit))}
          nutritionGroupOverrides={section.type === "food" ? nutritionGroupOverrides : undefined}
          onSetNutritionGroup={
            section.type === "food" && !isDemoData
              ? (item, groupId) => void (groupId ? realSetNutritionGroup(item.item, groupId) : realClearNutritionGroup(item.item))
              : undefined
          }
          onDelete={(item) => (isDemoData ? demoDeleteItem(item) : void handleDelete(item))}
        />
      ),
    })),
  ];
  const sectionByLabel = new Map(manageSections.map((sec) => [sec.label, sec.el]));
  const appSections: { label: string; el: ReactNode }[] = [
    { label: "Appearance", el: <AppearanceCard key="appearance" /> },
    { label: "Visible sections", el: <VisibleSectionsCard key="visible-sections" isDemoData={isDemoData} /> },
    { label: "Your data", el: <DataExportCard key="your-data" isDemoData={isDemoData} /> },
  ];
  for (const sec of appSections) sectionByLabel.set(sec.label, sec.el);

  const groups: { title: string; labels: string[] }[] = [
    { title: "Tracking", labels: ["Food", "Food products", "Symptoms", "Supplements", "Habits", "Workout", "Coffee", "Stool options"] },
    { title: "Health", labels: ["Doctors", "Doctor types", "Lab results", "Weight goal"] },
    { title: "Lists", labels: ["Reminder lists", "Wishlist lists"] },
    { title: "App", labels: ["Appearance", "Visible sections", "Your data"] },
  ];
  const isSearching = searchQuery.trim().length > 0;
  const groupBox = "inset-rows rounded-2xl border shadow-[var(--shadow-card)]";
  const groupBoxStyle = { borderColor: "var(--border-hairline)", background: "var(--surface-1)" } as const;

  return (
    <ManageNavContext.Provider value={{ active: activeSection, open: openSection }}>
      <div className="flex max-w-2xl flex-col gap-5">
        <div>
          {activeSection !== null && !isSearching && (
            <button
              type="button"
              onClick={closeSection}
              className="-ml-1 mb-1 flex min-h-11 items-center gap-0.5 text-sm font-medium"
              style={{ color: "var(--ui-accent)" }}
            >
              <ChevronIcon dir="left" size={16} />
              Settings
            </button>
          )}
          <PageHeading actions={!isDemoData && activeSection === null && <PushNotificationsToggle />}>
            {activeSection !== null && !isSearching ? activeSection : "Settings"}
          </PageHeading>
          {isDemoData && <DemoNotice className="mt-2" />}
          {actionError && (
            <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
              {actionError}
            </p>
          )}
        </div>

        {activeSection === null && (
          <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search every item, in every section…" className="w-full" />
        )}

        {activeSection !== null && !isSearching ? (
          sectionByLabel.get(activeSection)
        ) : isSearching ? (
          <div className="flex flex-col gap-3">{manageSections.map((sec) => sec.el)}</div>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1.5">
              <h2 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                {group.title}
              </h2>
              <div className={groupBox} style={groupBoxStyle}>
                {group.labels.map((label) => sectionByLabel.get(label))}
                {group.title === "App" && (
                  <Link href="/manage/nutrition-evidence" className="flex min-h-11 items-center gap-2 px-4">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Nutrition evidence
                    </span>
                    <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
                      <ChevronIcon dir="right" size={14} />
                    </span>
                  </Link>
                )}
              </div>
            </div>
          ))
        )}

      {duplicateConflict && (
        <DuplicateItemDialog
          name={duplicateConflict.item.item}
          isArchived={duplicateConflict.item.isArchived}
          busy={busyIdentity === duplicateConflict.item.itemIdentity}
          onClose={() => setDuplicateConflict(null)}
          onUnarchive={() => {
            const { item } = duplicateConflict;
            if (isDemoData) demoToggleArchive(item);
            else void realToggleArchive(item);
            setDuplicateConflict(null);
          }}
        />
      )}
      </div>
    </ManageNavContext.Provider>
  );
}
