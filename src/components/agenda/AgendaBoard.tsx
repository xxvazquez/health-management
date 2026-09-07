"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AGENDA_BUCKET_LABEL, AGENDA_BUCKET_ORDER, type AgendaBucket, type AgendaEntry, type AgendaKind, type AgendaScope } from "@/lib/aggregations/agenda";
import { isRecurringTask } from "@/lib/reminders";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { TaskForm, type TaskFormValues } from "@/components/reminders/TaskForm";
import { Disclosure } from "@/components/ui/Disclosure";
import { Field } from "@/components/ui/Field";
import { ListSection } from "@/components/ui/ListSection";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { ChoicePanel } from "@/components/ui/ChoicePanel";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { ChevronIcon } from "@/components/ui/icons";
import { FIELD_CLS, FIELD_STYLE } from "@/components/ui/formField";

const ACCENT = "var(--series-berry)";

function UndoIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 8H4V5" />
      <path d="M4 8a6.5 6.5 0 1 1-1.2 5" />
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? ACCENT : "var(--border-hairline)",
        background: active ? `color-mix(in oklab, ${ACCENT} 12%, var(--surface-1))` : "transparent",
        color: active ? ACCENT : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

const SCOPE_LABEL: Record<"all" | AgendaScope, string> = { all: "All", mine: "Mine", shared: "Shared", medical: "Medical" };
const TYPE_LABEL: Record<"all" | AgendaKind, string> = { all: "All", reminder: "Reminders", expiry: "Expiring", followup: "Follow-ups", appointment: "Appointments" };

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
      <Field label="Product">
        <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunscreen" maxLength={150} className={`${FIELD_CLS} font-medium`} style={FIELD_STYLE} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field label="Expires on" className="flex-1">
          <input type="date" required value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
        </Field>
        <Field label="Remind (days before)">
          <input type="number" min={0} value={remind} onChange={(e) => setRemind(e.target.value)} className={`${FIELD_CLS} w-24`} style={FIELD_STYLE} />
        </Field>
      </div>
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
  | { mode: "choose" }
  | { mode: "reminder"; scope: "mine" | "shared" }
  | { mode: "expiry"; scope: "mine" | "shared" };

export function AgendaBoard(props: AgendaBoardProps) {
  const { entries, lists, partnerLinked, loading, error, assignable } = props;
  const [typeFilter, setTypeFilter] = useState<"all" | AgendaKind>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | AgendaScope>("all");
  const [listFilter, setListFilter] = useState<string | "all">("all");
  const [add, setAdd] = useState<AddState>(null);
  const [editing, setEditing] = useState<AgendaEntry | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Filters + add */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "reminder", "expiry", "appointment"] as const).map((t) => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>
          {partnerLinked && (
            <div className="flex flex-wrap gap-1.5">
              {(["all", "mine", "shared", "medical"] as const).map((s) => (
                <Chip key={s} active={scopeFilter === s} onClick={() => setScopeFilter(s)}>
                  {SCOPE_LABEL[s]}
                </Chip>
              ))}
            </div>
          )}
          {showList && (typeFilter === "all" || typeFilter === "reminder") && (
            <div className="flex flex-wrap gap-1.5">
              <Chip active={listFilter === "all"} onClick={() => setListFilter("all")}>
                All lists
              </Chip>
              <Chip active={listFilter === "__default__"} onClick={() => setListFilter("__default__")}>
                Reminders
              </Chip>
              {lists.map((l) => (
                <Chip key={l.id} active={listFilter === l.id} onClick={() => setListFilter(l.id)}>
                  {l.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <PrimaryAction label="Add" accent={ACCENT} onClick={() => setAdd({ mode: "choose" })} />
      </div>

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
        <div className="flex flex-col gap-4">
          {AGENDA_BUCKET_ORDER.map((bucket) => {
            const rows = grouped.get(bucket) ?? [];
            if (rows.length === 0) return null;
            const collapsed = bucket === "later" || bucket === "someday" || bucket === "done";
            const body = (
              <div className="flex flex-col">
                {rows.map((e) => (
                  <AgendaRow
                    key={e.key}
                    entry={e}
                    confirming={confirmingDelete === e.key}
                    onComplete={() => void props.onCompleteReminder(e)}
                    onUncomplete={() => void props.onUncompleteReminder(e)}
                    onEdit={() => setEditing(e)}
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
            );
            if (collapsed) {
              return (
                <Disclosure key={bucket} className="px-1" label={AGENDA_BUCKET_LABEL[bucket]} count={rows.length}>
                  <div className="mt-1">{body}</div>
                </Disclosure>
              );
            }
            const tone =
              bucket === "overdue" ? "var(--status-critical)" : bucket === "today" ? "var(--status-serious)" : undefined;
            return (
              <ListSection key={bucket} label={AGENDA_BUCKET_LABEL[bucket]} count={rows.length} accent={tone}>
                {body}
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
}: {
  entry: AgendaEntry;
  confirming: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const e = entry;
  const done = e.bucket === "done";
  const isReminder = e.kind === "reminder";
  const readOnly = e.kind === "followup" || e.kind === "appointment";
  const recurring = e.reminder ? isRecurringTask(e.reminder) : false;

  const meta = (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
      {e.subtitle && <span className="truncate">{e.subtitle}</span>}
      {recurring && e.reminder?.recurrenceDays != null && (
        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in oklab, ${ACCENT} 14%, transparent)`, color: ACCENT }}>
          every {e.reminder.recurrenceDays}d
        </span>
      )}
      {e.scope === "shared" && <span>· shared</span>}
      {e.when && <span>· {e.when}</span>}
    </span>
  );

  const inner = (
    <>
      {isReminder ? (
        <button
          type="button"
          onClick={done ? onUncomplete : onComplete}
          aria-label={done ? "Mark not done" : recurring ? "Mark done for this cycle" : "Mark done"}
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors hover:border-[var(--status-good)] hover:bg-[var(--page-plane)]"
          style={{
            borderColor: done ? "var(--status-good)" : "var(--text-secondary)",
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
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.bucket === "overdue" ? "var(--status-critical)" : "var(--text-muted)" }} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <span className={clsx("block truncate text-sm", done && "line-through")} style={{ color: done ? "var(--text-muted)" : "var(--text-primary)", fontWeight: 500 }}>
          {e.title}
        </span>
        {(e.subtitle || e.when || recurring || e.scope === "shared") && meta}
      </div>
    </>
  );

  return (
    <div className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
      {readOnly ? (
        <Link href={e.href ?? "/medical"} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-80">
          {inner}
          <ChevronIcon dir="right" size={14} />
        </Link>
      ) : (
        <>
          {inner}
          {confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={onConfirmDelete} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete
              </button>
              <button type="button" onClick={onCancelDelete} className="rounded-md px-2 py-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Keep
              </button>
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
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
