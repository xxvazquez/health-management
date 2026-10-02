"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AGENDA_BUCKET_LABEL, AGENDA_BUCKET_ORDER, EXPIRY_GROUP_LABEL, EXPIRY_GROUP_ORDER, expiryGroup, type AgendaBucket, type AgendaEntry, type ExpiryGroup, recurrenceLabel } from "@/lib/aggregations/agenda";
import { isRecurringTask } from "@/lib/reminders";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSwipeReveal, SWIPE_REVEAL_CLASS } from "@/lib/useSwipeReveal";

const ACCENT = "var(--series-berry)";

// Each time section's colour, warm to cool as it gets further away: it tints
// the section heading, the row's date, its dot and its checkbox ring.
const BUCKET_TONE: Record<AgendaBucket, string | undefined> = {
  overdue: "var(--status-critical)",
  today: "var(--status-serious)",
  tomorrow: "var(--status-warning)",
  week: "var(--series-2)",
  later: "var(--series-slate)",
  someday: undefined,
  done: undefined,
};
const EXPIRY_TONE: Record<ExpiryGroup, string | undefined> = {
  expired: "var(--status-critical)",
  today: "var(--status-serious)",
  thisWeek: "var(--status-warning)",
  nextWeek: "var(--series-2)",
  twoWeeks: "var(--series-indigo)",
  nextMonth: "var(--series-3)",
  sixMonths: "var(--series-1)",
  nextYear: "var(--series-slate)",
  later: undefined,
};

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

function HourglassIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 3h9M5.5 17h9M6.5 3v2.5c0 1.6 1.4 3 3.5 4.5 2.1-1.5 3.5-2.9 3.5-4.5V3M6.5 17v-2.5c0-1.6 1.4-3 3.5-4.5 2.1 1.5 3.5 2.9 3.5 4.5V17" />
    </svg>
  );
}

/** Expiry product create / edit form — name, date, remind-days-before. */
function ExpiryForm({
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  initial?: { name: string; expiresOn: string; remindDaysBefore: number };
  onSave: (name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
  /** Clears an existing product off the list — used up or thrown away. */
  onRemove?: () => Promise<void>;
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

  async function remove() {
    if (!onRemove) return;
    setSaving(true);
    setError(null);
    try {
      await onRemove();
    } catch (err) {
      console.error("agenda expiry remove failed", err);
      setError("Couldn't remove that — try again in a moment.");
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
      {onRemove && (
        <FormGroup>
          {(["Used up", "Thrown away"] as const).map((label) => (
            <button
              key={label}
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium disabled:opacity-40"
              style={{ color: label === "Used up" ? "var(--series-2)" : "var(--status-critical)" }}
            >
              {label}
            </button>
          ))}
        </FormGroup>
      )}
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
  const [add, setAdd] = useState<AddState>(null);
  const [editing, setEditing] = useState<AgendaEntry | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<AgendaEntry | null>(null);

  const views: AgendaView[] = partnerLinked ? ["all", "mine", "shared", "expiry", "medical"] : ["all", "reminders", "expiry", "medical"];

  const filtered = useMemo(() => entries.filter((e) => inView(e, view)), [entries, view]);

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
        tone: EXPIRY_TONE[g],
        open: true,
      }));
    }
    return AGENDA_BUCKET_ORDER.map((bucket) => ({
      id: bucket,
      label: AGENDA_BUCKET_LABEL[bucket],
      rows: grouped.get(bucket) ?? [],
      tone: BUCKET_TONE[bucket],
      // A narrowed view is short, so only Done starts folded there.
      open: view === "all" ? !COLLAPSED_BUCKETS.has(bucket) : bucket !== "done",
    }));
  }, [view, filtered, grouped]);

  // Add/edit forms open as sheets over the agenda.
  let formSheet: ReactNode = null;
  if (add?.mode === "reminder" || editing?.kind === "reminder") {
    const scope = editing ? (editing.scope as "mine" | "shared") : (add as { scope: "mine" | "shared" }).scope;
    formSheet = (
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
  } else if (add?.mode === "expiry" || editing?.kind === "expiry") {
    const scope = editing ? (editing.scope as "mine" | "shared") : (add as { scope: "mine" | "shared" }).scope;
    const it = editing?.expiry;
    formSheet = (
      <ExpiryForm
        initial={it ? { name: it.name, expiresOn: it.expiresOn, remindDaysBefore: it.remindDaysBefore } : undefined}
        onSave={async (name, on, remind) => {
          if (editing) await props.onEditExpiry(editing, name, on, remind);
          else await props.onCreateExpiry(scope, name, on, remind);
          setAdd(null);
          setEditing(null);
        }}
        onRemove={
          editing
            ? async () => {
                await props.onDeleteExpiry(editing);
                setEditing(null);
              }
            : undefined
        }
        onCancel={() => {
          setAdd(null);
          setEditing(null);
        }}
      />
    );
  }

  const ready = !loading && !error;

  return (
    <div className="flex flex-col gap-5">
      {formSheet}
      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete “${confirmingDelete.title}”?`}
          message={confirmingDelete.scope === "shared" ? "It's removed for both of you." : "This can't be undone."}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            const e = confirmingDelete;
            setConfirmingDelete(null);
            if (e.kind === "reminder") void props.onDeleteReminder(e);
            else if (e.kind === "expiry") void props.onDeleteExpiry(e);
          }}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
      <PageHeading
        subtitle={subtitle}
        actions={
          ready ? (
            <AddMenu
                accent={ACCENT}
                options={[
                  { label: partnerLinked ? "My reminder" : "Reminder", onClick: () => setAdd({ mode: "reminder", scope: "mine" }) },
                  ...(partnerLinked ? [{ label: "Shared reminder", onClick: () => setAdd({ mode: "reminder" as const, scope: "shared" as const }) }] : []),
                  { label: partnerLinked ? "My expiry product" : "Expiry product", onClick: () => setAdd({ mode: "expiry", scope: "mine" }) },
                  ...(partnerLinked ? [{ label: "Shared expiry product", onClick: () => setAdd({ mode: "expiry" as const, scope: "shared" as const }) }] : []),
                ]}
              />
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
                      tone={tone}
                      onComplete={() => void props.onCompleteReminder(e)}
                      onUncomplete={() => void props.onUncompleteReminder(e)}
                      onEdit={() => setEditing(e)}
                      onAskDelete={() => setConfirmingDelete(e)}
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
  tone,
  onComplete,
  onUncomplete,
  onEdit,
  onAskDelete,
}: {
  entry: AgendaEntry;
  /** The row's time-section colour. */
  tone?: string;
  onComplete: () => void;
  onUncomplete: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
}) {
  const e = entry;
  const done = e.bucket === "done";
  const overdue = e.bucket === "overdue";
  const isReminder = e.kind === "reminder";
  const readOnly = e.kind === "followup" || e.kind === "appointment";
  const recurring = e.reminder ? isRecurringTask(e.reminder) : false;
  const subitems = e.reminder?.subitems ?? [];
  const { revealed, onTouchStart, onTouchEnd } = useSwipeReveal();
  const subitemsDone = subitems.filter((s) => s.done).length;

  // The note preview gets its own line; checklist progress, repeat and
  // "Shared" share one.
  const details = [
    subitems.length > 0 ? `${subitemsDone} of ${subitems.length}` : null,
    recurring && e.reminder?.recurrenceDays != null ? recurrenceLabel(e.reminder.recurrenceDays) : null,
    e.scope === "shared" ? "Shared" : null,
  ]
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
      className="min-w-[4.25rem] shrink-0 pt-0.5 text-right text-xs leading-tight whitespace-nowrap tabular-nums"
      style={{ color: tone ?? "var(--text-muted)", fontWeight: overdue ? 600 : 500 }}
    >
      {e.when}
    </span>
  ) : (
    <span className="w-[4.25rem] shrink-0" aria-hidden="true" />
  );

  const label = (
    <>
      {isReminder ? (
        <button
          type="button"
          onClick={done ? onUncomplete : onComplete}
          aria-label={done ? "Mark not done" : recurring ? "Mark done for this cycle" : "Mark done"}
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors hover:border-[var(--status-good)] hover:bg-[var(--page-plane)]"
          style={{
            borderColor: done ? "var(--status-good)" : (tone ?? "var(--text-secondary)"),
            background: done ? "var(--status-good)" : "transparent",
          }}
        >
          {done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--surface-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 6.5 5 9l4.5-5" />
            </svg>
          )}
        </button>
      ) : e.kind === "expiry" ? (
        // Nothing to tick off: a product is cleared from its sheet.
        <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center" style={{ color: tone ?? "var(--text-muted)" }} aria-hidden="true">
          <HourglassIcon />
        </span>
      ) : (
        // Same footprint as the checkbox above, so a read-only row's title
        // lands in the same column as a checkable one instead of drifting
        // left — only the mark inside is smaller, since there's nothing to
        // tap here.
        <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden="true">
          <span className="h-2 w-2 rounded-full" style={{ background: tone ?? "var(--text-muted)" }} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className={clsx("block text-sm break-words", done && "line-through")} style={{ color: done ? "var(--text-muted)" : "var(--text-primary)", fontWeight: 500 }}>
          {e.title}
        </span>
        {meta}
      </div>
    </>
  );

  return (
    // Tapping the row opens it for editing, as in Reminders; its own
    // buttons (checkbox, checklist, swipe actions) keep their taps.
    <div
      className={clsx("group relative flex items-start gap-3 border-t py-3 first:border-t-0", !readOnly && "cursor-pointer")}
      style={{ borderColor: "var(--gridline)", touchAction: "pan-y" }}
      onTouchStart={readOnly ? undefined : onTouchStart}
      onTouchEnd={readOnly ? undefined : onTouchEnd}
      onClick={
        readOnly
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
          {/* On desktop the hover actions float over the row's right edge
              instead of keeping an empty gap beside the date. */}
          <div
            className={clsx(
              "flex shrink-0 items-center gap-3 transition-opacity lg:absolute lg:inset-y-0 lg:right-0 lg:min-w-24 lg:justify-end lg:pl-3",
              revealed ? SWIPE_REVEAL_CLASS.shown : SWIPE_REVEAL_CLASS.hidden,
            )}
            style={{ background: "var(--surface-1)" }}
          >
            {done && (
              <button type="button" onClick={onUncomplete} aria-label="Undo last done" className="p-1" style={{ color: "var(--text-muted)" }}>
                <UndoIcon size={15} />
              </button>
            )}
            <button type="button" onClick={onEdit} aria-label="Edit" className="p-1" style={{ color: "var(--text-muted)" }}>
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              onClick={onAskDelete}
              aria-label="Delete"
              className="p-1"
              style={{ color: "var(--text-muted)" }}
            >
              <TrashIcon size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
