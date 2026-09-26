"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { CONTROL_CLS, CONTROL_STYLE } from "@/components/ui/Chip";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AGENDA_BUCKET_LABEL, AGENDA_BUCKET_ORDER, EXPIRY_GROUP_LABEL, EXPIRY_GROUP_ORDER, expiryGroup, type AgendaBucket, type AgendaEntry, recurrenceLabel } from "@/lib/aggregations/agenda";
import { isRecurringTask, type TaskSubitem } from "@/lib/reminders";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { TaskForm, type TaskFormValues } from "@/components/reminders/TaskForm";
import { Field } from "@/components/ui/Field";
import { ListSection } from "@/components/ui/ListSection";
import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { FormShell } from "@/components/ui/FormShell";
import { AddMenu } from "@/components/ui/AddMenu";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { ChevronIcon } from "@/components/ui/icons";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { FormGroup } from "@/components/ui/FormGroup";
import { useSwipeReveal, SWIPE_REVEAL_CLASS } from "@/lib/useSwipeReveal";

const ACCENT = "var(--series-berry)";

// Buckets that open collapsed — the "not now" tail of the list.
const COLLAPSED_BUCKETS: ReadonlySet<AgendaBucket> = new Set(["later", "someday", "done"]);

function UndoIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 8H4V5" />
      <path d="M4 8a6.5 6.5 0 1 1-1.2 5" />
    </svg>
  );
}

/** The views across the top of Agenda. Mine/Shared split by owner (with a
 * linked partner), Reminders stands in for them without one; Expiry is every
 * expiring product, Medical the follow-ups and appointments. */
type AgendaView = "all" | "mine" | "shared" | "reminders" | "expiry" | "medical";
const VIEW_LABEL: Record<AgendaView, string> = { all: "All", mine: "Mine", shared: "Shared", reminders: "Reminders", expiry: "Expiry", medical: "Medical" };

function inView(e: AgendaEntry, view: AgendaView): boolean {
  if (view === "all") return true;
  if (view === "mine" || view === "shared" || view === "medical") return e.scope === view;
  if (view === "reminders") return e.kind === "reminder";
  return e.kind === "expiry";
}

function FunnelIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 4.5h13l-5 6.2V16l-3 1.4v-6.7Z" />
    </svg>
  );
}

interface FilterState {
  listFilter: string | "all";
  setListFilter: (v: string | "all") => void;
}

/** The Filter toggle that sits in the page heading — a count badge shows
 * how many filters are on while the panel is closed. */
function FilterButton({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
  const lit = open || count > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={CONTROL_CLS}
      style={lit ? { background: `color-mix(in oklab, ${ACCENT} 16%, var(--surface-1))`, color: ACCENT } : CONTROL_STYLE}
    >
      <FunnelIcon />
      Filter
      {count > 0 && (
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums"
          style={{ background: ACCENT, color: "var(--surface-1)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** The expandable filter panel — which reminder list to show, plus Clear
 * once one is picked. Rendered full-width under the view switcher. */
function FilterPanel({ lists, filters }: { lists: ReminderList[]; filters: FilterState }) {
  const { listFilter, setListFilter } = filters;
  return (
    <div className="flex flex-col gap-2">
      <FormGroup>
        <Field label="List" inline>
          <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} className={ROW_INLINE_CLS} style={ROW_STYLE}>
            <option value="all">All lists</option>
            <option value="__default__">Reminders</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </FormGroup>
      {listFilter !== "all" && (
        <button type="button" onClick={() => setListFilter("all")} className="self-start px-3.5 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
          Clear
        </button>
      )}
    </div>
  );
}

/** Expiry product create / edit form — name, date, remind-days-before. */
function ExpiryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; expiresOn: string; remindDaysBefore: number };
  onSave: (name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? todayLocalISODate());
  const [remind, setRemind] = useState(String(initial?.remindDaysBefore ?? 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), expiresOn, Math.max(0, Number(remind) || 0));
    } catch (err) {
      console.error("agenda expiry save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell
      title={initial ? "Edit product" : "New product"}
      onSubmit={submit}
      onCancel={onCancel}
      submitLabel={initial ? "Done" : "Add"}
      submitDisabled={saving || !name.trim()}
      busy={saving}
      accent="var(--series-2)"
    >
      <FormGroup>
        <Field label="Product">
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunscreen" maxLength={150} className={`${ROW_TEXT_CLS} font-medium`} style={ROW_STYLE} />
        </Field>
        <Field label="Expires on" inline>
          <DatePicker value={expiresOn} onChange={setExpiresOn} title="Expires on" />
        </Field>
        <Field label="Remind (days before)" inline>
          <input inputMode="numeric" value={remind} onChange={(e) => setRemind(e.target.value)} className={`${ROW_INLINE_CLS} w-16`} style={ROW_STYLE} />
        </Field>
      </FormGroup>
      {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
    </FormShell>
  );
}

export interface AgendaBoardProps {
  entries: AgendaEntry[];
  /** Client-only date string for the heading; undefined before hydration. */
  subtitle?: string;
  lists: ReminderList[];
  partnerLinked: boolean;
  loading?: boolean;
  error?: boolean;
  assignable?: { myUserId: string; partnerId: string | null };
  onCompleteReminder: (e: AgendaEntry) => Promise<void>;
  onUncompleteReminder: (e: AgendaEntry) => Promise<void>;
  onEditReminder: (e: AgendaEntry, v: TaskFormValues) => Promise<void>;
  onDeleteReminder: (e: AgendaEntry) => Promise<void>;
  onCreateReminder: (scope: "mine" | "shared", v: TaskFormValues) => Promise<void>;
  onToggleSubitem: (e: AgendaEntry, subitem: TaskSubitem) => void;
  onEditExpiry: (e: AgendaEntry, name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
  onDeleteExpiry: (e: AgendaEntry) => Promise<void>;
  onCreateExpiry: (scope: "mine" | "shared", name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
}

type AddState =
  | null
  | { mode: "reminder"; scope: "mine" | "shared" }
  | { mode: "expiry"; scope: "mine" | "shared" };

export function AgendaBoard(props: AgendaBoardProps) {
  const { entries, subtitle, lists, partnerLinked, loading, error, assignable } = props;
  const [view, setView] = useState<AgendaView>("all");
  const [listFilter, setListFilter] = useState<string | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [add, setAdd] = useState<AddState>(null);
  const [editing, setEditing] = useState<AgendaEntry | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const filters: FilterState = { listFilter, setListFilter };
  const activeCount = listFilter !== "all" ? 1 : 0;
  const views: AgendaView[] = partnerLinked ? ["all", "mine", "shared", "expiry", "medical"] : ["all", "reminders", "expiry", "medical"];

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (!inView(e, view)) return false;
      if (listFilter !== "all") {
        if (e.kind !== "reminder") return false;
        if ((e.reminder?.listId ?? null) !== (listFilter === "__default__" ? null : listFilter)) return false;
      }
      return true;
    });
  }, [entries, view, listFilter]);

  const grouped = useMemo(() => {
    const map = new Map<AgendaBucket, AgendaEntry[]>();
    for (const e of filtered) {
      (map.get(e.bucket) ?? map.set(e.bucket, []).get(e.bucket)!).push(e);
    }
    return map;
  }, [filtered]);

  // The list's sections: urgency buckets, or — in the Expiry view — how far
  // off each product's date is.
  const sections = useMemo(() => {
    if (view === "expiry") {
      const today = todayLocalISODate();
      return EXPIRY_GROUP_ORDER.map((g) => ({
        id: g,
        label: EXPIRY_GROUP_LABEL[g],
        rows: filtered.filter((e) => e.expiry && expiryGroup(e.expiry.expiresOn, today) === g),
        tone: g === "expired" ? "var(--status-critical)" : g === "today" ? "var(--status-serious)" : undefined,
        open: true,
      }));
    }
    return AGENDA_BUCKET_ORDER.map((bucket) => ({
      id: bucket,
      label: AGENDA_BUCKET_LABEL[bucket],
      rows: grouped.get(bucket) ?? [],
      tone: bucket === "overdue" ? "var(--status-critical)" : bucket === "today" ? "var(--status-serious)" : undefined,
      // A narrowed view is short, so only Done starts folded there.
      open: view === "all" ? !COLLAPSED_BUCKETS.has(bucket) : bucket !== "done",
    }));
  }, [view, filtered, grouped]);

  // ---- add / edit forms take over the whole surface, same as the boards
  if (add?.mode === "reminder" || editing?.kind === "reminder") {
    const scope = editing ? (editing.scope as "mine" | "shared") : (add as { scope: "mine" | "shared" }).scope;
    return (
      <TaskForm
        accent={ACCENT}
        recurrenceMode="optional"
        lists={scope === "mine" ? lists : undefined}
        assignable={scope === "shared" ? assignable : undefined}
        initial={editing?.reminder}
        onSave={async (v) => {
          if (editing) await props.onEditReminder(editing, v);
          else await props.onCreateReminder(scope, v);
          setAdd(null);
          setEditing(null);
        }}
        onCancel={() => {
          setAdd(null);
          setEditing(null);
        }}
      />
    );
  }
  if (add?.mode === "expiry" || editing?.kind === "expiry") {
    const scope = editing ? (editing.scope as "mine" | "shared") : (add as { scope: "mine" | "shared" }).scope;
    const it = editing?.expiry;
    return (
      <ExpiryForm
        initial={it ? { name: it.name, expiresOn: it.expiresOn, remindDaysBefore: it.remindDaysBefore } : undefined}
        onSave={async (name, on, remind) => {
          if (editing) await props.onEditExpiry(editing, name, on, remind);
          else await props.onCreateExpiry(scope, name, on, remind);
          setAdd(null);
          setEditing(null);
        }}
        onCancel={() => {
          setAdd(null);
          setEditing(null);
        }}
      />
    );
  }

  const showList = lists.length > 0;
  const ready = !loading && !error;

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        subtitle={subtitle}
        actions={
          ready ? (
            <div className="flex items-center gap-2">
              {showList && <FilterButton open={filterOpen} count={activeCount} onToggle={() => setFilterOpen((o) => !o)} />}
              <AddMenu
                accent={ACCENT}
                options={[
                  { label: partnerLinked ? "My reminder" : "Reminder", onClick: () => setAdd({ mode: "reminder", scope: "mine" }) },
                  ...(partnerLinked ? [{ label: "Shared reminder", onClick: () => setAdd({ mode: "reminder" as const, scope: "shared" as const }) }] : []),
                  { label: partnerLinked ? "My expiry product" : "Expiry product", onClick: () => setAdd({ mode: "expiry", scope: "mine" }) },
                  ...(partnerLinked ? [{ label: "Shared expiry product", onClick: () => setAdd({ mode: "expiry" as const, scope: "shared" as const }) }] : []),
                ]}
              />
            </div>
          ) : undefined
        }
      >
        Agenda
      </PageHeading>

      {ready && (
        <SegmentedTabs
          items={views.map((v) => ({ id: v, label: VIEW_LABEL[v], accent: ACCENT }))}
          activeId={view}
          onSelect={setView}
          ariaLabel="Agenda view"
        />
      )}

      {ready && showList && filterOpen && <FilterPanel lists={lists} filters={filters} />}

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState what="your agenda" />
      ) : filtered.length === 0 ? (
        view === "all" ? (
          <InlineEmpty title="Nothing on your agenda" description="Reminders, expiring products and upcoming appointments show up here, soonest first." />
        ) : (
          <InlineEmpty title={`Nothing in ${VIEW_LABEL[view]}`} description="Switch to All to see everything." />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(({ id: bucket, label, rows, tone, open }) => {
            if (rows.length === 0) return null;
            return (
              <ListSection
                // Keyed by view too, so switching views resets which open.
                key={`${view}:${bucket}`}
                label={label}
                count={rows.length}
                accent={tone}
                collapsible
                defaultOpen={open}
              >
                <div className="flex flex-col">
                  {rows.map((e) => (
                    <AgendaRow
                      key={e.key}
                      entry={e}
                      confirming={confirmingDelete === e.key}
                      onComplete={() => void props.onCompleteReminder(e)}
                      onUncomplete={() => void props.onUncompleteReminder(e)}
                      onEdit={() => setEditing(e)}
                      onToggleSubitem={(s) => props.onToggleSubitem(e, s)}
                      onAskDelete={() => setConfirmingDelete(e.key)}
                      onCancelDelete={() => setConfirmingDelete(null)}
                      onConfirmDelete={() => {
                        setConfirmingDelete(null);
                        if (e.kind === "reminder") void props.onDeleteReminder(e);
                        else if (e.kind === "expiry") void props.onDeleteExpiry(e);
                      }}
                    />
                  ))}
                </div>
              </ListSection>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgendaRow({
  entry,
  confirming,
  onComplete,
  onUncomplete,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleSubitem,
}: {
  entry: AgendaEntry;
  confirming: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onToggleSubitem: (subitem: TaskSubitem) => void;
}) {
  const e = entry;
  const done = e.bucket === "done";
  const overdue = e.bucket === "overdue";
  const isReminder = e.kind === "reminder";
  const readOnly = e.kind === "followup" || e.kind === "appointment";
  const recurring = e.reminder ? isRecurringTask(e.reminder) : false;
  const subitems = e.reminder?.subitems ?? [];
  const { revealed, onTouchStart, onTouchEnd } = useSwipeReveal();
  // Reminders always toggle done. An expired product has no "done" state,
  // but once it's overdue a checkbox to clear it from the list (a delete)
  // is more useful than a dead bullet.
  const checkable = isReminder || (e.kind === "expiry" && overdue);

  // The note preview gets its own line; repeat and "Shared" share one.
  const details = [recurring && e.reminder?.recurrenceDays != null ? recurrenceLabel(e.reminder.recurrenceDays) : null, e.scope === "shared" ? "Shared" : null]
    .filter(Boolean)
    .join(" · ");
  const meta =
    e.subtitle || details ? (
      <span className="mt-0.5 flex flex-col gap-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {e.subtitle && <span className="truncate">{e.subtitle}</span>}
        {details && <span>{details}</span>}
      </span>
    ) : null;

  // Relative timing in a fixed right-hand column so it lines up down the
  // list. Bold red once overdue.
  const whenEl = e.when ? (
    <span
      className="w-[4.25rem] shrink-0 pt-0.5 text-right text-xs leading-tight tabular-nums"
      style={{ color: overdue ? "var(--status-critical)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}
    >
      {e.when}
    </span>
  ) : (
    <span className="w-[4.25rem] shrink-0" aria-hidden="true" />
  );

  const label = (
    <>
      {checkable ? (
        <button
          type="button"
          onClick={isReminder ? (done ? onUncomplete : onComplete) : onConfirmDelete}
          aria-label={
            isReminder ? (done ? "Mark not done" : recurring ? "Mark done for this cycle" : "Mark done") : "Clear this expired item"
          }
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors hover:border-[var(--status-good)] hover:bg-[var(--page-plane)]"
          style={{
            borderColor: done ? "var(--status-good)" : overdue ? "var(--status-critical)" : "var(--text-secondary)",
            background: done ? "var(--status-good)" : "transparent",
          }}
        >
          {done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--surface-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 6.5 5 9l4.5-5" />
            </svg>
          )}
        </button>
      ) : (
        // Same footprint as the checkbox above, so a read-only row's title
        // lands in the same column as a checkable one instead of drifting
        // left — only the mark inside is smaller, since there's nothing to
        // tap here.
        <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: overdue ? "var(--status-critical)" : "var(--text-muted)" }} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className={clsx("block text-sm break-words", done && "line-through")} style={{ color: done ? "var(--text-muted)" : "var(--text-primary)", fontWeight: 500 }}>
          {e.title}
        </span>
        {meta}
        {subitems.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {subitems.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onToggleSubitem(s);
                }}
                className="flex min-h-[18px] items-center gap-2 text-left"
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: s.done ? "var(--status-good)" : "var(--text-secondary)", background: s.done ? "var(--status-good)" : "transparent" }}
                >
                  {s.done && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="var(--surface-1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.5 6.5 5 9l4.5-5" />
                    </svg>
                  )}
                </span>
                <span className={clsx("text-xs", s.done && "line-through")} style={{ color: s.done ? "var(--text-muted)" : "var(--text-secondary)" }}>
                  {s.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    // Tapping the row opens it for editing, as in Reminders; its own
    // buttons (checkbox, checklist, swipe actions) keep their taps.
    <div
      className={clsx("group flex items-start gap-3 border-t py-3 first:border-t-0", !readOnly && "cursor-pointer")}
      style={{ borderColor: "var(--gridline)", touchAction: "pan-y" }}
      onTouchStart={readOnly ? undefined : onTouchStart}
      onTouchEnd={readOnly ? undefined : onTouchEnd}
      onClick={
        readOnly || confirming
          ? undefined
          : (ev) => {
              if ((ev.target as HTMLElement).closest("button, a, input")) return;
              onEdit();
            }
      }
    >
      {readOnly ? (
        <Link href={e.href ?? "/medical"} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-80">
          {label}
          {whenEl}
          <ChevronIcon dir="right" size={14} />
        </Link>
      ) : (
        <>
          {label}
          {whenEl}
          {confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={onConfirmDelete} className="min-h-9 rounded-md px-3 text-sm font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete
              </button>
              <button type="button" onClick={onCancelDelete} className="min-h-9 rounded-md px-3 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                Keep
              </button>
            </span>
          ) : (
            <div className={clsx("flex shrink-0 items-center gap-3 transition-opacity", revealed ? SWIPE_REVEAL_CLASS.shown : SWIPE_REVEAL_CLASS.hidden)}>
              {done && (
                <button type="button" onClick={onUncomplete} aria-label="Undo last done" className="p-1" style={{ color: "var(--text-muted)" }}>
                  <UndoIcon size={15} />
                </button>
              )}
              <button type="button" onClick={onEdit} aria-label="Edit" className="p-1" style={{ color: "var(--text-muted)" }}>
                <PencilIcon size={15} />
              </button>
              <button type="button" onClick={onAskDelete} aria-label="Delete" className="p-1" style={{ color: "var(--text-muted)" }}>
                <TrashIcon size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
