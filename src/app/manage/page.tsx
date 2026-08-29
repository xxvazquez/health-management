"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { useVisibleDomains, DOMAIN_LABELS, type TrackedDomain } from "@/lib/visibleDomains";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ItemNameField, ItemActionButtons, useInlineRename } from "@/components/ui/ItemActions";
import { DuplicateItemDialog } from "@/components/ui/DuplicateItemDialog";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";
import { useItemActions, type ManageableItem } from "@/lib/useItemActions";
import { getAllItems, getAllCategories, getItemIdentitiesWithHistory, withDataLock } from "@/lib/db/indexedDb";
import { putItemAndSync, deleteCategoryAndSync } from "@/lib/supabase/sync";
import { ensureCategoryId, categoryRowsToSeedForDemo } from "@/lib/categoryResolution";
import { lookupFoodCategory } from "@/taxonomy/classify";
import { POLAND_FOOD_CATALOG } from "@/taxonomy/polandFoodCatalog";
import { normalizeName, titleCaseFallback } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, type ItemType } from "@/taxonomy/categories";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import { WORKOUT_UNITS, workoutUnitLabel, defaultWorkoutUnitForCategory, type RawItem, type RawCategory, type WorkoutUnit } from "@/lib/types";
import { createReminderList, deleteReminderList, fetchReminderLists, renameReminderList, type ReminderList } from "@/lib/supabase/personalReminders";
import { buildDemoReminderLists } from "@/lib/demoPersonalReminders";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";

// Log tab order — Food, Symptoms, Supplements, Habits, Stool, Workout,
// Cycle — so the toggle list reads left-to-right the same way the tabs
// it controls do.
const DOMAIN_TOGGLE_ORDER: TrackedDomain[] = ["food", "outcome", "supplement", "habit", "stool", "workout", "cycle"];

/** Turns a tracked type on/off everywhere it appears — its Log tab and,
 * for Food/Workout/Cycle, its Analytics dashboard link — without deleting
 * or archiving anything underneath. Purely a local display preference
 * (see visibleDomains.tsx), not synced: "I don't track this on this
 * device" rather than a change to the account's actual data. */
function VisibleSectionsCard() {
  const { hidden, toggle } = useVisibleDomains();
  return (
    <Card tier="supporting">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Visible sections
      </p>
      <p className="mt-0.5 mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        Hide anything you don&apos;t track — it disappears from the Log page&apos;s tabs (and its Analytics page, if it
        has one) on this device. Nothing underneath is deleted or archived.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DOMAIN_TOGGLE_ORDER.map((domain) => {
          const isHidden = hidden.has(domain);
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
 * created, renamed and deleted here rather than on the Reminders tab
 * itself, so that tab stays a plain list switcher. Deleting a list drops
 * its tasks back to the default "Reminders" bucket (DB `on delete set
 * null`), it never removes them. */
function ReminderListsCard({ isDemoData }: { isDemoData: boolean }) {
  const [lists, setLists] = useState<ReminderList[]>(() => (isDemoData ? buildDemoReminderLists() : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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
      setLists((prev) => [...prev, { id: `demo-list-${Date.now()}`, name, sortOrder: prev.length }]);
      return;
    }
    try {
      const created = await createReminderList(name, lists.length);
      setLists((prev) => [...prev, created]);
    } catch (err) {
      console.error("createReminderList failed", err);
    }
  }

  async function handleRename(id: string) {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    if (!isDemoData) await renameReminderList(id, name).catch((err) => console.error("renameReminderList failed", err));
  }

  async function handleDelete(id: string) {
    setConfirmingDeleteId(null);
    setLists((prev) => prev.filter((l) => l.id !== id));
    if (!isDemoData) await deleteReminderList(id).catch((err) => console.error("deleteReminderList failed", err));
  }

  return (
    <Card tier="supporting">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Reminder lists
      </p>
      <p className="mt-0.5 mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        The buckets your reminders are organised into on the Log page. Deleting a list moves its reminders back to
        the default &ldquo;Reminders&rdquo; list — it never deletes them.
      </p>

      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <ul className="mb-3 flex flex-col divide-y divide-[color:var(--gridline)]">
          {lists.length === 0 && (
            <li className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
              No custom lists yet — everything sits in the default &ldquo;Reminders&rdquo; list.
            </li>
          )}
          {lists.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              {editingId === l.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRename(l.id);
                  }}
                >
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => void handleRename(l.id)}
                    maxLength={40}
                    className="flex-1 rounded-md border px-2 py-1 text-sm outline-none"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                  />
                </form>
              ) : (
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                  {l.name}
                </span>
              )}

              {confirmingDeleteId === l.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void handleDelete(l.id)} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmingDeleteId(null)} className="rounded-md px-2 py-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Keep
                  </button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(l.id);
                      setEditingName(l.name);
                    }}
                    aria-label={`Rename ${l.name}`}
                    title="Rename"
                    className="rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <PencilIcon size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(l.id)}
                    aria-label={`Delete ${l.name}`}
                    title="Delete"
                    className="notebook-danger rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <TrashIcon size={15} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
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
    </Card>
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M16.5 16.5 13 13" />
    </svg>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
        <SearchIcon />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search every item, in every section…"
        className="w-full rounded-md border py-2 pr-9 pl-9 text-sm"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 -translate-y-1/2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      )}
    </div>
  );
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
        // pill-field: see the matching comment on CategoryManager's
        // add-category input.
        className="pill-field rounded-md border px-2.5 py-1.5 text-sm leading-5"
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
      <button
        type="submit"
        disabled={!trimmed || busy}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        style={{ background: "var(--series-1)" }}
      >
        {busy ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

/** Add/remove which categories a type offers. */
function CategoryManager({
  categories,
  onAddCategory,
  onRemoveCategory,
}: {
  categories: readonly string[];
  onAddCategory: (name: string) => Promise<void>;
  onRemoveCategory: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    await onAddCategory(trimmed);
    setName("");
    setBusy(false);
  }

  return (
    <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--gridline)" }}>
      <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        Categories
      </p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs whitespace-nowrap"
            style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
          >
            {c}
            <button
              type="button"
              onClick={() => void onRemoveCategory(c)}
              aria-label={`Remove category ${c}`}
              className="leading-none"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a category…"
          // pill-field opts this typed field out of the mobile 16px-font
          // rule (globals.css) — confirmed on-device not to trigger iOS's
          // zoom-on-focus, so it can stay at the same size as the category
          // pills it sits next to instead of visibly ballooning past them.
          className="pill-field rounded-md border px-2.5 py-1 text-xs leading-4"
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
        // pill-field: see the matching comment on CategoryManager's
        // add-category input (manage/page.tsx).
        className="pill-field w-20 rounded-md border px-2 py-1 text-xs leading-4 outline-none disabled:opacity-40"
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

function ItemRow({
  item,
  itemType,
  categories,
  busy,
  onArchiveToggle,
  onRename,
  onChangeCategory,
  onHideCatalog,
  onSetReminderTime,
  onSetUnit,
  knownUnits,
  onDelete,
}: {
  item: ManageableItem;
  itemType: ItemType;
  categories: readonly string[] | null;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
  onChangeCategory?: (newCategory: string) => void;
  onHideCatalog?: () => void;
  onSetReminderTime?: (time: string | null) => void;
  onSetUnit?: (unit: WorkoutUnit) => void;
  knownUnits?: WorkoutUnit[];
  onDelete?: () => void;
}) {
  const renameState = useInlineRename(item, onRename);
  if (item.itemIdentity === "" && onHideCatalog) {
    return <CatalogFoodRow item={item} busy={busy} onHide={onHideCatalog} />;
  }
  const canRemind = onSetReminderTime && (itemType === "supplement" || itemType === "habit");
  const canSetUnit = onSetUnit && itemType === "workout";
  // Delete is only ever offered for an item with zero logged history — see
  // ManageableItem.hasHistory's doc comment for why (an item with any
  // history can't be hard-deleted, only archived).
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <ItemNameField item={item} state={renameState} />
      <span className="flex items-center gap-3">
        <ItemActionButtons
          item={item}
          busy={busy}
          state={renameState}
          onArchiveToggle={onArchiveToggle}
          onDelete={item.hasHistory === false ? onDelete : undefined}
        />
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
                className="text-xs leading-none disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            )}
          </span>
        )}
        {canSetUnit && <UnitSelect unit={item.unit ?? "kg"} knownUnits={knownUnits ?? []} busy={busy} onSetUnit={onSetUnit} itemName={item.item} />}
        {categories && onChangeCategory ? (
          <select
            value={item.category}
            disabled={busy}
            onChange={(e) => onChangeCategory(e.target.value)}
            // appearance-none strips iOS Safari's native control chrome, and
            // leading-4 pins line-height to the 16px this pill was designed
            // around — without both, the forced 16px font-size below
            // (globals.css, to stop iOS auto-zooming on focus) renders with
            // native chrome's own bulky padding AND the browser's inherited
            // "normal" line-height (~21px, not the 16px text-xs asks for),
            // ballooning this pill well past its intended size on a phone.
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
      </span>
    </li>
  );
}

function ItemSection({
  itemType,
  label,
  placeholder,
  items,
  categories,
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
  onHideCatalogFood,
  onSetReminderTime,
  onSetUnit,
  onDelete,
}: {
  itemType: ItemType;
  label: string;
  placeholder: string;
  items: ManageableItem[];
  categories: readonly string[];
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
  /** Food only — materializes a catalog-only suggestion as a real,
   * archived item so it stops being offered on the Log page. */
  onHideCatalogFood?: (name: string, category: string) => Promise<void>;
  /** Supplement/habit only — set from the Manage page, absent everywhere
   * else, gated inside ItemRow. */
  onSetReminderTime?: (item: ManageableItem, time: string | null) => void;
  /** Workout only — set from the Manage page, absent everywhere else,
   * gated inside ItemRow. */
  onSetUnit?: (item: ManageableItem, unit: WorkoutUnit) => void;
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
    <Card tier="raw">
      <button type="button" onClick={onToggleOpen} disabled={isSearching} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {label}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ""}
          </p>
        </div>
        {!isSearching && (
          <span className="shrink-0 text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            {sectionOpen ? "Hide" : "Show"}
          </span>
        )}
      </button>

      {sectionOpen && (
        <div className="mt-4">
          <CategoryManager categories={categories} onAddCategory={onAddCategory} onRemoveCategory={onRemoveCategory} />

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
                  busy={item.itemIdentity !== "" && busyIdentity === item.itemIdentity}
                  onArchiveToggle={() => onToggleArchive(item)}
                  onRename={(name) => onRename(item, name)}
                  onChangeCategory={(category) => onChangeCategory(item, category)}
                  onHideCatalog={onHideCatalogFood ? () => void onHideCatalogFood(item.item, item.category) : undefined}
                  onSetReminderTime={onSetReminderTime ? (time) => onSetReminderTime(item, time) : undefined}
                  onSetUnit={onSetUnit ? (unit) => onSetUnit(item, unit) : undefined}
                  knownUnits={knownUnits}
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
  const [removeCategoryError, setRemoveCategoryError] = useState<string | null>(null);
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

  async function handleRemoveCategory(itemType: ItemType, name: string) {
    setRemoveCategoryError(null);
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
      setRemoveCategoryError(`"${name}" is still used by at least one ${itemType} item — recategorize those first.`);
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
   * logged history (see ItemRow's `hasHistory === false` gate), so nothing
   * is lost; still confirmed since it can't be undone. `deleteItemAndSync`
   * re-verifies that freshly right before deleting and throws if it's since
   * become stale (something logged this item since this page last loaded)
   * — surfaced here rather than silently swallowed. */
  async function handleDelete(item: ManageableItem) {
    if (!window.confirm(`Delete "${item.item}"? It's never been logged, so nothing will be lost, but this can't be undone.`)) return;
    try {
      await realDeleteItem(item);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't delete this item — please try again.");
      await refresh();
    }
  }

  // --- Demo-mode equivalents of the handlers above — same shapes, but
  // mutating local state instead of IndexedDB/Supabase. See the demo-state
  // declarations up top for why this never touches real storage. ---

  function demoDeleteItem(item: ManageableItem) {
    if (!window.confirm(`Delete "${item.item}"? It's never been logged, so nothing will be lost, but this can't be undone.`)) return;
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

  function demoRemoveCategory(itemType: ItemType, name: string): Promise<void> {
    setRemoveCategoryError(null);
    if (itemsByType[itemType].some((i) => i.itemIdentity !== "" && i.category === name)) {
      setRemoveCategoryError(`"${name}" is still used by at least one ${itemType} item — recategorize those first.`);
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
  if (!isDemoData && rawItems === null) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty" && !isDemoData) return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Manage items
          </h1>
          {!isDemoData && <PushNotificationsToggle />}
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Add, rename, archive, or unarchive anything you track, manage the category list for Food,
          Supplements, Habits, and Symptoms, and organise your reminder lists. Everything here is synced straight
          to your account — the same tables every page reads from, so there&apos;s nowhere else to edit this by
          hand. Archiving hides an item from the Log page and this list&apos;s active section; its full logged
          history stays in every dashboard. Turn on notifications above, then set a time on any supplement or
          habit below to get reminded.
        </p>
        <Link href="/manage/nutrition-evidence" className="mt-2 inline-block text-sm underline decoration-dotted" style={{ color: "var(--series-2)" }}>
          Nutrition evidence →
        </Link>
        {isDemoData && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
            Example data — try adding, renaming, archiving, and managing categories freely below. None of this is
            saved anywhere; sign in to manage your real items instead.
          </p>
        )}
        {removeCategoryError && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
            {removeCategoryError}
          </p>
        )}
      </div>

      <VisibleSectionsCard />

      <ReminderListsCard isDemoData={isDemoData} />

      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      {TYPE_SECTIONS.map((section) => (
        <ItemSection
          key={section.type}
          itemType={section.type}
          label={section.label}
          placeholder={section.placeholder}
          items={itemsByType[section.type]}
          categories={categoryNamesByType[section.type]}
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
          onHideCatalogFood={
            section.type === "food" ? (name, category) => (isDemoData ? demoHideCatalogFood(name, category) : handleHideCatalogFood(name, category)) : undefined
          }
          // Demo/signed-out visitors can't receive push at all, so the
          // control doesn't render rather than offering a setting that can
          // never do anything — see PushNotificationsToggle above.
          onSetReminderTime={isDemoData ? undefined : (item, time) => void realSetReminderTime(item, time)}
          onSetUnit={(item, unit) => (isDemoData ? demoSetUnit(item, unit) : void realSetUnit(item, unit))}
          onDelete={(item) => (isDemoData ? demoDeleteItem(item) : void handleDelete(item))}
        />
      ))}

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
