"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { useVisibleDomains, DOMAIN_LABELS, type TrackedDomain } from "@/lib/visibleDomains";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { SearchField } from "@/components/ui/SearchField";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ItemNameField, ItemActionButtons, useInlineRename } from "@/components/ui/ItemActions";
import { ManageRow } from "@/components/ui/ManageRow";
import { TrashIcon } from "@/components/ui/Notebook";
import { PageHeading } from "@/components/ui/PageHeading";
import { IconColorPicker } from "@/components/ui/IconColorPicker";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";
import { DuplicateItemDialog } from "@/components/ui/DuplicateItemDialog";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";
import { DataExportCard } from "@/components/manage/DataExportCard";
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
import { useDoctors } from "@/lib/useDoctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import type { Doctor, DoctorPatch } from "@/lib/supabase/doctors";
import { ComboBox, DoctorName, LanguageChips, RatingChips } from "@/components/doctors/shared";

// Log tab order — Food, Symptoms, Supplements, Habits, Stool, Workout,
// Cycle — so the toggle list reads left-to-right the same way the tabs
// it controls do.
const DOMAIN_TOGGLE_ORDER: TrackedDomain[] = ["food", "outcome", "supplement", "habit", "stool", "workout", "cycle"];

/** A collapsible section card for the settings blocks (Reminder lists,
 * Doctor types) — same shell, header and count subtitle as the item
 * sections below, so the whole Manage page reads as one list. Starts
 * collapsed; `forceOpen` (a live search) pins it open. */
function CollapsibleManageCard({
  title,
  subtitle,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = forceOpen || open;
  return (
    <Card tier="raw" padded={false}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={forceOpen}
        aria-expanded={shown}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {!forceOpen && (
          <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
            <ChevronIcon dir={shown ? "down" : "right"} size={13} />
          </span>
        )}
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        {subtitle && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </span>
        )}
      </button>
      {shown && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

/** Turns a tracked type on/off everywhere it appears — its Log tab and,
 * for Food/Workout/Cycle, its Analytics dashboard link — without deleting
 * or archiving anything underneath. Sections show up on their own once
 * they have data; these toggles override that in either direction. Purely
 * a local display preference (see visibleDomains.tsx), not synced. */
function VisibleSectionsCard() {
  const { isVisible, toggle } = useVisibleDomains();
  return (
    <Card tier="supporting">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Visible sections
      </p>
      <p className="mt-0.5 mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        Each section appears on the Log page&apos;s tabs (and its Trends dashboard, if it has one) once you&apos;ve
        logged something in it. Turn one on to start tracking it before then, or off to hide it even once it has
        data — on this device only. Nothing underneath is deleted or archived.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DOMAIN_TOGGLE_ORDER.map((domain) => {
          const isHidden = !isVisible(domain);
          return (
            <button
              key={domain}
              type="button"
              onClick={() => toggle(domain)}
              aria-pressed={!isHidden}
              className="rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                borderColor: isHidden ? "var(--border-hairline)" : "var(--series-1)",
                background: isHidden ? "transparent" : "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))",
                color: isHidden ? "var(--text-muted)" : "var(--series-1)",
                textDecoration: isHidden ? "line-through" : "none",
              }}
            >
              {DOMAIN_LABELS[domain]}
            </button>
          );
        })}
      </div>
    </Card>
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
    >
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        The buckets your reminders are organised into on the Log page. Deleting a list moves its reminders back to
        the default &ldquo;Reminders&rdquo; list — it never deletes them.
      </p>

      <form onSubmit={handleAdd} className="mb-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New list name"
          maxLength={40}
          className="flex-1 rounded-md border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button type="submit" disabled={!newName.trim()} className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ color: "var(--series-1)" }}>
          Add list
        </button>
      </form>

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--gridline)]">
          {!isSearching && lists.length === 0 && (
            <li className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
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
    >
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        The specialties offered when logging a doctor appointment. Hide the ones you don&apos;t need or add your own —
        appointments you&apos;ve already logged keep their type either way.
      </p>

      <form onSubmit={handleAdd} className="mb-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New doctor type"
          maxLength={60}
          className="flex-1 rounded-md border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button type="submit" disabled={!newName.trim()} className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ color: "var(--series-1)" }}>
          Add type
        </button>
      </form>

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-[color:var(--gridline)]">
            {active.length === 0 && !isSearching && (
              <li className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Every type is hidden — add one above or show one back.
              </li>
            )}
            {active.map(rowEl)}
          </ul>

          {hidden.length > 0 && (
            <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--gridline)" }}>
              <button
                type="button"
                onClick={() => setHiddenOpen((v) => !v)}
                disabled={isSearching}
                className="text-xs font-medium underline decoration-dotted disabled:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                Hidden ({hidden.length}) — {isSearching || hiddenOpen ? "Hide" : "Show"}
              </button>
              {(isSearching || hiddenOpen) && (
                <ul className="mt-2 flex flex-col divide-y divide-[color:var(--gridline)] opacity-70">{hidden.map(rowEl)}</ul>
              )}
            </div>
          )}
        </>
      )}
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
    >
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        The chips offered in the Log page&apos;s Stool tab. Hide the ones you don&apos;t use or add your own — entries you&apos;ve
        already logged keep their value either way.
      </p>

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
              <div key={kind}>
                <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  {title}
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addOption(kind);
                  }}
                  className="mb-2 flex items-center gap-2"
                >
                  <input
                    value={newLabels[kind] ?? ""}
                    onChange={(e) => setNewLabels((p) => ({ ...p, [kind]: e.target.value }))}
                    placeholder={placeholder}
                    maxLength={60}
                    className="flex-1 rounded-md border px-2.5 py-1.5 text-xs outline-none"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                  />
                  <button
                    type="submit"
                    disabled={!(newLabels[kind] ?? "").trim() || busy}
                    className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    style={{ color: "var(--series-1)" }}
                  >
                    Add
                  </button>
                </form>

                <ul className="flex flex-col divide-y divide-[color:var(--gridline)]">
                  {active.length === 0 && !isSearching && (
                    <li className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      Every {title.toLowerCase().replace(/s$/, "")} is hidden — add one above or show one back.
                    </li>
                  )}
                  {active.map((e) => (
                    <StoolOptionRow key={e.id} option={e} busy={busy} onPatch={(p) => void patch(e, p)} onDelete={() => void removeOption(e)} />
                  ))}
                </ul>

                {hidden.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setHiddenOpen((p) => ({ ...p, [kind]: !p[kind] }))}
                      disabled={isSearching}
                      className="text-xs font-medium underline decoration-dotted disabled:opacity-100"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Hidden ({hidden.length}) — {showHidden ? "Hide" : "Show"}
                    </button>
                    {showHidden && (
                      <ul className="mt-1 flex flex-col divide-y divide-[color:var(--gridline)] opacity-70">
                        {hidden.map((e) => (
                          <StoolOptionRow key={e.id} option={e} busy={busy} onPatch={(p) => void patch(e, p)} onDelete={() => void removeOption(e)} />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleManageCard>
  );
}

function StoolOptionRow({
  option,
  busy,
  onPatch,
  onDelete,
}: {
  option: StoolOption;
  busy: boolean;
  onPatch: (patch: StoolOptionPatch) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(option.label);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== option.label) onPatch({ label: next });
  }

  return (
    <li className="flex items-center gap-2 py-2">
      {option.kind === "color" && (
        <input
          type="color"
          value={option.swatch ?? "#8a5a34"}
          onChange={(e) => onPatch({ swatch: e.target.value })}
          disabled={busy}
          aria-label={`${option.label} colour`}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      )}
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            maxLength={60}
            className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(option.label);
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate text-left text-sm"
          style={{ color: option.isArchived ? "var(--text-muted)" : "var(--text-primary)" }}
        >
          {option.label}
        </button>
      )}

      {!editing &&
        (confirmingDelete ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              className="text-xs font-semibold"
              style={{ color: "var(--status-critical)" }}
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Keep
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onPatch({ isArchived: !option.isArchived })}
              disabled={busy}
              className="text-xs font-medium disabled:opacity-40"
              style={{ color: "var(--text-secondary)" }}
            >
              {option.isArchived ? "Show" : "Hide"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              aria-label={`Delete ${option.label}`}
              className="disabled:opacity-40"
              style={{ color: "var(--text-muted)" }}
            >
              <TrashIcon size={14} />
            </button>
          </span>
        ))}
    </li>
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
  const accent = "var(--series-1)";

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
      await api.doctors.create({ name, specialty, rating: null, language: null });
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
    >
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        The doctors you can attach an appointment to — name, rating, language and their current specialty. Their visit history
        lives on Health &rarr; Doctors.
      </p>

      {!isSearching &&
        (adding ? (
          <form onSubmit={handleAdd} className="mb-3 flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border-hairline)" }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Doctor name"
              maxLength={120}
              className="rounded-md border px-2.5 py-1.5 text-xs outline-none"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
            <ComboBox value={newSpecialty} onChange={setNewSpecialty} options={specialtyOptions} placeholder="Specialty" accent={accent} />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" accent={accent} disabled={!newName.trim() || busy}>
                Add doctor
              </Button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-3 rounded-md border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
          >
            + Add doctor
          </button>
        ))}

      {api.doctors.data.length === 0 ? (
        <p className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
          No doctors yet — add one above, or while logging an appointment.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--gridline)]">
          {shown.map((doctor) => {
            const visits = api.appointments.data.filter((a) => a.doctorId === doctor.id).length;
            const editing = editingId === doctor.id;
            return (
              <li key={doctor.id} className="py-2">
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : doctor.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <DoctorName name={doctor.name} rating={doctor.rating} className="text-sm" />
                    <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {doctor.specialty || "No specialty"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {visits} visit{visits === 1 ? "" : "s"}
                  </span>
                  <ChevronIcon dir={editing ? "down" : "right"} size={13} />
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

  function commitName() {
    const next = nameDraft.trim();
    if (next && next !== doctor.name) onEdit({ name: next });
    else setNameDraft(doctor.name);
  }

  return (
    <div className="mt-2.5 flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)" }}>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Name
        </span>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          maxLength={120}
          className="rounded-md border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Specialty
        </span>
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
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Rating
        </span>
        <RatingChips value={doctor.rating} onChange={(rating) => onEdit({ rating })} accent={accent} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Language
        </span>
        <LanguageChips value={doctor.language} onChange={(language) => onEdit({ language })} accent={accent} />
      </div>
      <DoctorDeleteButton
        disabled={!canDelete}
        hint={!canDelete ? "Delete their appointments first" : undefined}
        onDelete={onDelete}
      />
    </div>
  );
}

function DoctorDeleteButton({ disabled, hint, onDelete }: { disabled: boolean; hint?: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (disabled) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    );
  }
  return confirming ? (
    <span className="flex items-center gap-2 text-xs">
      <button type="button" onClick={onDelete} className="font-semibold" style={{ color: "var(--status-critical)" }}>
        Delete doctor
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="font-medium" style={{ color: "var(--text-muted)" }}>
        Keep
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="notebook-danger self-start rounded-md text-xs font-medium"
      style={{ color: "var(--text-muted)" }}
    >
      Delete doctor
    </button>
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
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border px-2.5 py-1.5 text-sm leading-5"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      {needsCategory && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="appearance-none rounded-md border px-2.5 py-1.5 text-sm leading-5"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" size="sm" disabled={!trimmed || busy}>
        {busy ? "Adding…" : "Add"}
      </Button>
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
    <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--gridline)" }}>
      <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        Categories
      </p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const { icon } = appearanceFor(c);
          return (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap"
              style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
            >
              <button
                type="button"
                onClick={() => setExpanded((prev) => (prev === c ? null : c))}
                aria-label={`Change ${c}'s icon and colour`}
                aria-pressed={expanded === c}
                className="tap-target flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[var(--surface-1)]"
                style={{ color: accentFor(c) }}
              >
                <CustomIcon icon={icon} size={13} />
              </button>
              {c}
              <button
                type="button"
                onClick={() => void onRemoveCategory(c)}
                aria-label={`Remove category ${c}`}
                style={{ color: "var(--text-muted)" }}
              >
                <CloseIcon size={11} />
              </button>
            </span>
          );
        })}
      </div>

      {expanded !== null && (
        <div className="mt-2.5 flex flex-col gap-1.5 rounded-md border p-2.5" style={{ borderColor: "var(--border-hairline)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {expanded}
          </p>
          <IconColorPicker
            icon={appearanceFor(expanded).icon}
            color={appearanceFor(expanded).color}
            onIconChange={(icon) => void onSetAppearance(expanded, { ...appearanceFor(expanded), icon })}
            onColorChange={(color) => void onSetAppearance(expanded, { ...appearanceFor(expanded), color })}
            accent={accentFor(expanded)}
          />
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a category…"
          className="rounded-md border px-2.5 py-1 text-xs leading-4"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
          style={{ color: "var(--text-secondary)" }}
        >
          Add
        </button>
      </form>
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
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {item.item}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          not yet tracked · {item.category}
        </span>
      </span>
      <button
        type="button"
        onClick={onHide}
        disabled={busy}
        className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
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
        className="w-20 rounded-md border px-2 py-1 text-xs leading-4 outline-none disabled:opacity-40"
        style={{ borderColor: "var(--series-1)", background: "var(--surface-1)", color: "var(--text-primary)" }}
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
      // See the matching comment on ItemRow's category <select> — same
      // native-chrome-plus-inherited-line-height blowup on iOS without this.
      className="appearance-none rounded-md border px-2 py-1 text-xs leading-4 disabled:opacity-40"
      style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)", color: "var(--text-secondary)" }}
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
      // See the matching comment on ItemRow's category <select> — same
      // native-chrome-plus-inherited-line-height blowup on iOS without this.
      className="appearance-none rounded-md border px-2 py-1 text-xs leading-4 disabled:opacity-40"
      style={{ borderColor: override ? "var(--series-1)" : "var(--border-hairline)", background: "var(--page-plane)", color: "var(--text-secondary)" }}
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

function ItemRow({
  item,
  itemType,
  categories,
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
  const renameState = useInlineRename(item, onRename);
  if (item.itemIdentity === "" && onHideCatalog) {
    return <CatalogFoodRow item={item} busy={busy} onHide={onHideCatalog} />;
  }
  const canRemind = onSetReminderTime && (itemType === "supplement" || itemType === "habit");
  const canSetUnit = onSetUnit && itemType === "workout";
  const canSetNutritionGroup = onSetNutritionGroup && itemType === "food";
  // Delete is only ever offered for an item with zero logged history — see
  // ManageableItem.hasHistory's doc comment for why (an item with any
  // history can't be hard-deleted, only archived).
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <ItemNameField item={item} state={renameState} />
          {categories && onChangeCategory ? (
            <select
              value={item.category}
              disabled={busy}
              onChange={(e) => onChangeCategory(e.target.value)}
              // appearance-none strips iOS Safari's native control chrome and
              // leading-4 pins the line-height, so this select stays the same
              // compact size as the plain category pills next to it.
              className="appearance-none rounded-md border px-2 py-1 text-xs leading-4 disabled:opacity-40"
              style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)", color: "var(--text-secondary)" }}
            >
              {!categories.includes(item.category) && <option value={item.category}>{item.category}</option>}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {item.category}
            </span>
          )}
          {canRemind && (
            <span className="flex items-center gap-1">
              <input
                type="time"
                value={item.reminderTime ?? ""}
                disabled={busy}
                onChange={(e) => onSetReminderTime(e.target.value || null)}
                aria-label={`Reminder time for ${item.item}`}
                className="rounded-md border px-1.5 py-1 text-xs outline-none disabled:opacity-40"
                style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)", color: "var(--text-secondary)" }}
              />
              {item.reminderTime && (
                <button
                  type="button"
                  onClick={() => onSetReminderTime(null)}
                  disabled={busy}
                  aria-label={`Clear reminder for ${item.item}`}
                  className="disabled:opacity-40"
                  style={{ color: "var(--text-muted)" }}
                >
                  <CloseIcon size={11} />
                </button>
              )}
            </span>
          )}
          {canSetUnit && <UnitSelect unit={item.unit ?? "kg"} knownUnits={knownUnits ?? []} busy={busy} onSetUnit={onSetUnit} itemName={item.item} />}
          {canSetNutritionGroup && (
            <NutritionGroupSelect itemName={item.item} override={nutritionGroupOverride} busy={busy} onSetNutritionGroup={onSetNutritionGroup} />
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <ItemActionButtons
            item={item}
            busy={busy}
            state={renameState}
            onArchiveToggle={onArchiveToggle}
            onDelete={item.hasHistory === false ? onDelete : undefined}
          />
        </span>
      </div>
      {linkedDecisions && linkedDecisions.length > 0 && <SupplementWhyLine decisions={linkedDecisions} />}
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

function ItemSection({
  itemType,
  label,
  placeholder,
  items,
  categories,
  decisionsBySupplementId,
  searchQuery,
  open,
  onToggleOpen,
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
  open: boolean;
  onToggleOpen: () => void;
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
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const matches = (i: ManageableItem) => i.item.toLowerCase().includes(query);

  const active = items
    .filter((i) => !i.isArchived && (!isSearching || matches(i)))
    .sort((a, b) => a.item.localeCompare(b.item));
  const archived = items
    .filter((i) => i.isArchived && (!isSearching || matches(i)))
    .sort((a, b) => a.item.localeCompare(b.item));

  // Every unit already in play across this type's items, plus the built-in
  // starting suggestions — the select below offers all of them so picking
  // a unit someone else's exercise already uses is one click, same as
  // picking an existing category. Units aren't first-class rows (unlike
  // categories), so this is derived from usage rather than a stored list.
  const knownUnits =
    itemType === "workout"
      ? Array.from(new Set([...WORKOUT_UNITS, ...items.map((i) => i.unit).filter((u): u is WorkoutUnit => Boolean(u))])).sort((a, b) => a.localeCompare(b))
      : [];

  if (isSearching && active.length === 0 && archived.length === 0) return null;

  const sectionOpen = isSearching ? true : open;
  const archivedSectionOpen = isSearching ? archived.length > 0 : archivedOpen;

  return (
    <Card tier="raw" padded={false}>
      <button type="button" onClick={onToggleOpen} disabled={isSearching} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {!isSearching && (
          <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
            <ChevronIcon dir={sectionOpen ? "down" : "right"} size={13} />
          </span>
        )}
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {label}
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ""}
        </span>
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4">
          <CategoryManager
            categories={categories}
            appearanceByName={categoryAppearanceByName}
            typeAccent={TYPE_ACCENT[itemType]}
            onAddCategory={onAddCategory}
            onRemoveCategory={onRemoveCategory}
            onSetAppearance={onSetCategoryAppearance}
          />

          <div className="mb-4">
            <AddItemForm itemType={itemType} placeholder={placeholder} categories={categories} onAdd={onAdd} />
          </div>

          {active.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing tracked yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
              {active.map((item) => (
                <ItemRow
                  key={item.itemIdentity || `catalog:${item.item}`}
                  item={item}
                  itemType={itemType}
                  categories={categories}
                  linkedDecisions={decisionsBySupplementId?.get(item.itemIdentity)}
                  busy={item.itemIdentity !== "" && busyIdentity === item.itemIdentity}
                  onArchiveToggle={() => onToggleArchive(item)}
                  onRename={(name) => onRename(item, name)}
                  onChangeCategory={(category) => onChangeCategory(item, category)}
                  onHideCatalog={onHideCatalogFood ? () => void onHideCatalogFood(item.item, item.category) : undefined}
                  onSetReminderTime={onSetReminderTime ? (time) => onSetReminderTime(item, time) : undefined}
                  onSetUnit={onSetUnit ? (unit) => onSetUnit(item, unit) : undefined}
                  knownUnits={knownUnits}
                  nutritionGroupOverride={nutritionGroupOverrides?.[normalizeName(item.item)]}
                  onSetNutritionGroup={onSetNutritionGroup ? (groupId) => onSetNutritionGroup(item, groupId) : undefined}
                  onDelete={() => onDelete(item)}
                />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
              <button
                type="button"
                onClick={() => setArchivedOpen((v) => !v)}
                disabled={isSearching}
                className="text-xs font-medium underline decoration-dotted disabled:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                Archived ({archived.length}) — {archivedSectionOpen ? "Hide" : "Show"}
              </button>
              {archivedSectionOpen && (
                <ul className="mt-2 flex flex-col divide-y opacity-70" style={{ borderColor: "var(--gridline)" }}>
                  {archived.map((item) => (
                    <ItemRow
                      key={item.itemIdentity}
                      item={item}
                      itemType={itemType}
                      categories={categories}
                      busy={busyIdentity === item.itemIdentity}
                      onArchiveToggle={() => onToggleArchive(item)}
                      onRename={(name) => onRename(item, name)}
                      onChangeCategory={(category) => onChangeCategory(item, category)}
                      onSetReminderTime={onSetReminderTime ? (time) => onSetReminderTime(item, time) : undefined}
                      onSetUnit={onSetUnit ? (unit) => onSetUnit(item, unit) : undefined}
                      nutritionGroupOverride={nutritionGroupOverrides?.[normalizeName(item.item)]}
                      onSetNutritionGroup={onSetNutritionGroup ? (groupId) => onSetNutritionGroup(item, groupId) : undefined}
                      onDelete={() => onDelete(item)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
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
  const [openSections, setOpenSections] = useState<Set<ItemType>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
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

  function toggleSection(type: ItemType) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

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

  // Every editable grouping in one A–Z list, so the page is predictable to
  // scan — reminder lists and doctor types sort in with the tracked-item
  // sections rather than sitting pinned above them.
  const orderedManageSections: { label: string; el: ReactNode }[] = [
    { label: "Reminder lists", el: <ReminderListsCard key="reminder-lists" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Doctors", el: <DoctorsCard key="doctors" searchQuery={searchQuery} /> },
    { label: "Doctor types", el: <DoctorSpecialtiesCard key="doctor-types" isDemoData={isDemoData} searchQuery={searchQuery} /> },
    { label: "Stool options", el: <StoolOptionsCard key="stool-options" isDemoData={isDemoData} searchQuery={searchQuery} /> },
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
          open={openSections.has(section.type)}
          onToggleOpen={() => toggleSection(section.type)}
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
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <PageHeading actions={!isDemoData && <PushNotificationsToggle />}>Settings</PageHeading>
        {isDemoData && <DemoNotice className="mt-2" />}
        {actionError && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
            {actionError}
          </p>
        )}
      </div>

      <VisibleSectionsCard />

      <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search every item, in every section…" className="w-full" />

      {orderedManageSections.map((s) => s.el)}

      <DataExportCard isDemoData={isDemoData} />

      <Link
        href="/manage/nutrition-evidence"
        className="text-sm underline decoration-dotted"
        style={{ color: "var(--text-muted)" }}
      >
        Nutrition evidence — the research behind Food Analytics
      </Link>

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
  );
}
