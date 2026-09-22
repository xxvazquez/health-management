"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { CONTROL_CLS, CONTROL_STYLE } from "@/components/ui/Chip";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AGENDA_BUCKET_LABEL, AGENDA_BUCKET_ORDER, type AgendaBucket, type AgendaEntry, type AgendaKind, type AgendaScope } from "@/lib/aggregations/agenda";
import { isRecurringTask, type TaskSubitem } from "@/lib/reminders";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { TaskForm, type TaskFormValues } from "@/components/reminders/TaskForm";
import { Field } from "@/components/ui/Field";
import { ListSection } from "@/components/ui/ListSection";
import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { ChoicePanel } from "@/components/ui/ChoicePanel";
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

const SCOPE_LABEL: Record<"all" | AgendaScope, string> = { all: "All", mine: "Mine", shared: "Shared", medical: "Medical" };
const TYPE_LABEL: Record<"all" | AgendaKind, string> = { all: "All", reminder: "Reminders", expiry: "Expiring", followup: "Follow-ups", appointment: "Appointments" };

function FunnelIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 4.5h13l-5 6.2V16l-3 1.4v-6.7Z" />
    </svg>
  );
}

interface FilterState {
  typeFilter: "all" | AgendaKind;
  setTypeFilter: (v: "all" | AgendaKind) => void;
  scopeFilter: "all" | AgendaScope;
  setScopeFilter: (v: "all" | AgendaScope) => void;
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

/** The expandable filter panel — type / scope / list pickers as grouped
 * rows, plus a Clear all once anything is on. Rendered full-width under the
 * heading. */
function FilterPanel({
  partnerLinked,
  showList,
  lists,
  filters,
}: {
  partnerLinked: boolean;
  showList: boolean;
  lists: ReminderList[];
  filters: FilterState;
}) {
  const { typeFilter, setTypeFilter, scopeFilter, setScopeFilter, listFilter, setListFilter } = filters;
  const listShown = showList && (typeFilter === "all" || typeFilter === "reminder");
  const anyActive = typeFilter !== "all" || scopeFilter !== "all" || listFilter !== "all";

  return (
    <div className="flex flex-col gap-2">
      <FormGroup>
        <Field label="Show" inline>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className={ROW_INLINE_CLS} style={ROW_STYLE}>
            {(["all", "reminder", "expiry", "appointment"] as const).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {partnerLinked && (
          <Field label="Scope" inline>
            <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)} className={ROW_INLINE_CLS} style={ROW_STYLE}>
              {(["all", "mine", "shared", "medical"] as const).map((sc) => (
                <option key={sc} value={sc}>
                  {SCOPE_LABEL[sc]}
                </option>
              ))}
            </select>
          </Field>
        )}
        {listShown && (
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
        )}
      </FormGroup>
      {anyActive && (
        <button
          type="button"
          onClick={() => {
            setTypeFilter("all");
            setScopeFilter("all");
            setListFilter("all");
          }}
          className="self-start px-3.5 text-sm font-medium"
          style={{ color: "var(--ui-accent)" }}
        >
          Clear all
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
    <FormShell title={initial ? "Edit product" : "New product"} onSubmit={submit} onCancel={onCancel}>
      <FormGroup>
        <Field label="Product">
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunscreen" maxLength={150} className={`${ROW_TEXT_CLS} font-medium`} style={ROW_STYLE} />
        </Field>
        <Field label="Expires on" inline>
          <DatePicker value={expiresOn} onChange={setExpiresOn} title="Expires on" />
        </Field>
        <Field label="Remind (days before)" inline>
          <input type="number" min={0} value={remind} onChange={(e) => setRemind(e.target.value)} className={`${ROW_INLINE_CLS} w-16`} style={ROW_STYLE} />
        </Field>
      </FormGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" accent="var(--series-2)" disabled={saving || !name.trim()}>
          {saving ? "Saving…" : initial ? "Save changes" : "Save product"}
        </Button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
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
  | { mode: "choose" }
  | { mode: "reminder"; scope: "mine" | "shared" }
  | { mode: "expiry"; scope: "mine" | "shared" };

export function AgendaBoard(props: AgendaBoardProps) {
  const { entries, subtitle, lists, partnerLinked, loading, error, assignable } = props;
  const [typeFilter, setTypeFilter] = useState<"all" | AgendaKind>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | AgendaScope>("all");
  const [listFilter, setListFilter] = useState<string | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [add, setAdd] = useState<AddState>(null);
  const [editing, setEditing] = useState<AgendaEntry | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const filters: FilterState = { typeFilter, setTypeFilter, scopeFilter, setScopeFilter, listFilter, setListFilter };
  const activeCount = (typeFilter !== "all" ? 1 : 0) + (scopeFilter !== "all" ? 1 : 0) + (listFilter !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.kind !== typeFilter) return false;
      if (scopeFilter !== "all" && e.scope !== scopeFilter) return false;
      if (listFilter !== "all") {
        if (e.kind !== "reminder") return false;
        if ((e.reminder?.listId ?? null) !== (listFilter === "__default__" ? null : listFilter)) return false;
      }
      return true;
    });
  }, [entries, typeFilter, scopeFilter, listFilter]);

  const grouped = useMemo(() => {
    const map = new Map<AgendaBucket, AgendaEntry[]>();
    for (const e of filtered) {
      (map.get(e.bucket) ?? map.set(e.bucket, []).get(e.bucket)!).push(e);
    }
    return map;
  }, [filtered]);

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
              <FilterButton open={filterOpen} count={activeCount} onToggle={() => setFilterOpen((o) => !o)} />
              <PrimaryAction label="Add" accent={ACCENT} onClick={() => setAdd({ mode: "choose" })} />
            </div>
          ) : undefined
        }
      >
        Agenda
      </PageHeading>

      {ready && filterOpen && <FilterPanel partnerLinked={partnerLinked} showList={showList} lists={lists} filters={filters} />}

      {add?.mode === "choose" && (
        <ChoicePanel
          title="Add to your agenda"
          onCancel={() => setAdd(null)}
          options={[
            { label: partnerLinked ? "My reminder" : "Reminder", onClick: () => setAdd({ mode: "reminder", scope: "mine" }) },
            ...(partnerLinked ? [{ label: "Shared reminder", onClick: () => setAdd({ mode: "reminder" as const, scope: "shared" as const }) }] : []),
            { label: partnerLinked ? "My expiry product" : "Expiry product", onClick: () => setAdd({ mode: "expiry", scope: "mine" }) },
            ...(partnerLinked ? [{ label: "Shared expiry product", onClick: () => setAdd({ mode: "expiry" as const, scope: "shared" as const }) }] : []),
          ]}
        />
      )}

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState what="your agenda" />
      ) : filtered.length === 0 ? (
        <InlineEmpty title="Nothing on your agenda" description="Reminders, expiring products and upcoming appointments show up here, soonest first." />
      ) : (
        <div className="flex flex-col gap-3">
          {AGENDA_BUCKET_ORDER.map((bucket) => {
            const rows = grouped.get(bucket) ?? [];
            if (rows.length === 0) return null;
            const tone =
              bucket === "overdue" ? "var(--status-critical)" : bucket === "today" ? "var(--status-serious)" : undefined;
            return (
              <ListSection
                key={bucket}
                label={AGENDA_BUCKET_LABEL[bucket]}
                count={rows.length}
                accent={tone}
                collapsible
                defaultOpen={!COLLAPSED_BUCKETS.has(bucket)}
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

  const meta =
    e.subtitle || recurring || e.scope === "shared" ? (
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {e.subtitle && <span className="truncate">{e.subtitle}</span>}
        {recurring && e.reminder?.recurrenceDays != null && (
          <span className="font-medium" style={{ color: ACCENT }}>
            every {e.reminder.recurrenceDays}d
          </span>
        )}
        {e.scope === "shared" && <span>{e.subtitle || recurring ? "· shared" : "shared"}</span>}
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
    <div
      className="group flex items-start gap-3 border-t py-3 first:border-t-0"
      style={{ borderColor: "var(--gridline)", touchAction: "pan-y" }}
      onTouchStart={readOnly ? undefined : onTouchStart}
      onTouchEnd={readOnly ? undefined : onTouchEnd}
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
