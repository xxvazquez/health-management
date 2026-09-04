"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  compareTasksByDue,
  isRecurringTask,
  isTaskDone,
  isTaskDue,
  TASK_TIME_BUCKET_LABEL,
  TASK_TIME_BUCKET_ORDER,
  taskTimeBucket,
  type TaskItem,
} from "@/lib/reminders";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { ArchiveIcon } from "@/components/notes/icons";
import { ListSection, SectionIcon } from "@/components/ui/ListSection";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { FIELD_CLS as fieldCls, FIELD_STYLE as fieldStyle, LABEL_CLS as labelCls, LABEL_STYLE as labelStyle } from "@/components/ui/formField";

function UndoIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8h7a3.5 3.5 0 0 1 0 7H8" />
      <path d="M7.5 5 5 8l2.5 3" />
    </svg>
  );
}

/** Always-visible low-contrast row action — same language as the Notes
 * list's RowAction and the notebook rows. */
function IconAction({ onClick, label, tone = "muted", disabled, children }: { onClick: () => void; label: string; tone?: "muted" | "critical"; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`tap-target shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40 ${tone === "critical" ? "notebook-danger" : ""}`}
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

export type TaskBoardMode = "one-off" | "recurring" | "all";

const DEFAULT_LIST_NAME = "Reminders";

// The "Overdue" section header — a very muted, dusty red: enough to
// register at a glance, deliberately not the full critical tone.
const SOFT_OVERDUE = "color-mix(in oklab, var(--status-critical) 38%, var(--text-muted))";

/** The fields a create/edit form hands back — same tuple for both, so a
 * parent can point `onCreate` and `onEdit` at the same handler shape. */
export type TaskFormValues = {
  title: string;
  notes: string;
  dueAt: string | null;
  recurrenceDays: number | null;
  assignedTo: string | null;
  listId: string | null;
};

function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** ISO timestamp -> the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants,
 * in the viewer's own timezone (matching how the form reads it back). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Create OR edit form. `initial` (edit mode) pre-fills every field and
 * switches the button to "Save changes". */
function TaskForm({
  accent,
  recurrenceMode,
  assignable,
  lists,
  defaultListId,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  recurrenceMode: "none" | "optional" | "required";
  /** Home only — when set, offers an "Assigned to" dropdown (Anyone/Me/
   * Partner). Personal tasks have no second person to assign to. */
  assignable?: { myUserId: string; partnerId: string | null };
  /** Personal only — when set, offers a "List" dropdown. */
  lists?: ReminderList[];
  defaultListId?: string | null;
  initial?: TaskItem;
  onSave: (values: TaskFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [dueAtLocal, setDueAtLocal] = useState(initial?.dueAt && !isRecurringTask(initial) ? toLocalInput(initial.dueAt) : "");
  const [recurring, setRecurring] = useState(recurrenceMode === "required" || (initial != null && isRecurringTask(initial)));
  const [recurrenceDays, setRecurrenceDays] = useState(
    initial && isRecurringTask(initial) ? String(initial.recurrenceDays) : recurrenceMode === "required" ? "7" : "",
  );
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? "");
  const [listId, setListId] = useState(initial?.listId ?? defaultListId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usesRecurrence = recurrenceMode === "required" || (recurrenceMode === "optional" && recurring);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (usesRecurrence && (!recurrenceDays || Number(recurrenceDays) <= 0)) return;
    setSaving(true);
    setError(null);
    try {
      const dueAt = dueAtLocal
        ? new Date(dueAtLocal).toISOString()
        : usesRecurrence
          ? new Date(Date.now() + Number(recurrenceDays) * 86_400_000).toISOString()
          : null;
      await onSave({
        title,
        notes,
        dueAt,
        recurrenceDays: usesRecurrence ? Number(recurrenceDays) : null,
        assignedTo: assignedTo || null,
        listId: listId || null,
      });
    } catch (err) {
      console.error("task save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {initial ? "Edit reminder" : "New reminder"}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelCls} style={labelStyle}>
          What needs doing?
        </label>
        <input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Call the dentist"
          maxLength={150}
          className={`${fieldCls} font-medium`}
          style={fieldStyle}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelCls} style={labelStyle}>
          Notes <span style={{ color: "var(--text-muted)" }}>· optional</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything useful to remember"
          className={`${fieldCls} resize-y leading-relaxed`}
          style={fieldStyle}
        />
      </div>

      {recurrenceMode === "optional" && (
        <label className="flex items-center gap-2 text-xs font-medium" style={labelStyle}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ accentColor: accent }} />
          Repeats on a schedule
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {lists && (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              List
            </label>
            <select value={listId} onChange={(e) => setListId(e.target.value)} className={fieldCls} style={fieldStyle}>
              <option value="">{DEFAULT_LIST_NAME}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {assignable && (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              Assigned to
            </label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={fieldCls} style={fieldStyle}>
              <option value="">Anyone</option>
              <option value={assignable.myUserId}>Me</option>
              {assignable.partnerId && <option value={assignable.partnerId}>Partner</option>}
            </select>
          </div>
        )}

        {usesRecurrence ? (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              Repeat every
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                required
                value={recurrenceDays}
                onChange={(e) => setRecurrenceDays(e.target.value)}
                className={`${fieldCls} w-20`}
                style={fieldStyle}
              />
              <span className="text-xs" style={labelStyle}>
                days
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              Deadline <span style={{ color: "var(--text-muted)" }}>· optional</span>
            </label>
            <input type="datetime-local" value={dueAtLocal} onChange={(e) => setDueAtLocal(e.target.value)} className={fieldCls} style={fieldStyle} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Save reminder"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

/** Rebuild the form-values tuple from an existing task, with a field or two
 * overridden — lets a row-level control (the inline list picker) reuse the
 * same `onEdit` path as the full form without opening it. */
function taskToFormValues(task: TaskItem, overrides: Partial<TaskFormValues>): TaskFormValues {
  return {
    title: task.title,
    notes: task.notes ?? "",
    dueAt: task.dueAt,
    recurrenceDays: task.recurrenceDays,
    assignedTo: task.assignedTo,
    listId: task.listId,
    ...overrides,
  };
}


function CollapsibleGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t pt-2" style={{ borderColor: "var(--gridline)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-semibold tracking-wide uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={open ? "" : "-rotate-90"} aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
        {title} ({count})
      </button>
      {open && <div className="mt-1 flex flex-col">{children}</div>}
    </div>
  );
}

/** The list navigation strip — All, then each list, then the default
 * "Reminders" bucket, then a "+" to add one. Underlined tabs, matching the
 * rest of the app's navigation; not decorative pills. */
function ListStrip({
  lists,
  counts,
  selected,
  accent,
  onSelect,
  onCreate,
}: {
  lists: ReminderList[];
  counts: Map<string, number>;
  selected: string | null | "all";
  accent: string;
  onSelect: (id: string | null | "all") => void;
  onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const tab = (key: string, value: string | null | "all", label: string, count: number) => {
    const active = selected === value;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(value)}
        className="flex shrink-0 items-center gap-1.5 pb-2 text-sm whitespace-nowrap transition-colors"
        style={{
          color: active ? accent : "var(--text-secondary)",
          fontWeight: active ? 700 : 500,
          borderBottom: `2px solid ${active ? accent : "transparent"}`,
          marginBottom: "-1px",
        }}
      >
        {label}
        <span className="text-xs font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <nav className="no-scrollbar flex w-full items-center gap-5 overflow-x-auto border-b" style={{ borderColor: "var(--border-hairline)" }}>
      {tab("all", "all", "All", [...counts.values()].reduce((a, b) => a + b, 0))}
      {lists.map((l) => tab(l.id, l.id, l.name, counts.get(l.id) ?? 0))}
      {(counts.get("__default__") ?? 0) > 0 && tab("default", null, DEFAULT_LIST_NAME, counts.get("__default__") ?? 0)}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onCreate(name.trim());
            setName("");
            setAdding(false);
          }}
          className="flex shrink-0 items-center gap-1 pb-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (!name.trim()) setAdding(false);
            }}
            placeholder="List name"
            maxLength={40}
            className="w-28 rounded-md border px-2 py-1 text-xs outline-none"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
          <button type="submit" disabled={!name.trim()} className="rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-40" style={{ color: accent }}>
            Add
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="shrink-0 pb-2 text-sm font-medium" style={{ color: "var(--text-muted)" }} aria-label="New list">
          + List
        </button>
      )}
    </nav>
  );
}

export function TaskBoard({
  tasks,
  loading,
  error,
  accent,
  mode,
  assignable,
  lists,
  onCreateList,
  onCreate,
  onEdit,
  onComplete,
  onUncomplete,
  onArchive,
  onDelete,
  completedByLabel,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Tap New reminder to add one.",
}: {
  tasks: TaskItem[];
  loading: boolean;
  error: boolean;
  accent: string;
  mode: TaskBoardMode;
  /** Home only — see TaskForm's own doc comment. */
  assignable?: { myUserId: string; partnerId: string | null };
  /** Personal only — enables the list navigation + the form's List field.
   * Renaming/deleting a list happens on the Manage page, not here. */
  lists?: ReminderList[];
  onCreateList?: (name: string) => Promise<string>;
  onCreate: (values: TaskFormValues) => Promise<void>;
  onEdit: (id: string, values: TaskFormValues) => Promise<void>;
  onComplete: (task: TaskItem) => Promise<void>;
  onUncomplete: (task: TaskItem) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Home only — resolves a task's `lastCompletedBy`/`assignedTo` into
   * "you"/"your partner" without ever surfacing a raw email. */
  completedByLabel?: (userId: string) => string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [selectedList, setSelectedList] = useState<string | null | "all">("all");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const listName = (id: string | null): string => (id ? (lists?.find((l) => l.id === id)?.name ?? DEFAULT_LIST_NAME) : DEFAULT_LIST_NAME);

  // Per-list active-task counts (for the strip badges) — always over the
  // whole task set, independent of which list is showing.
  const listCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.isArchived || isTaskDone(t)) continue;
      const key = t.listId ?? "__default__";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const { active, done, archived } = useMemo(() => {
    const inMode = tasks.filter((t) => {
      if (mode === "one-off") return !isRecurringTask(t);
      if (mode === "recurring") return isRecurringTask(t);
      return true;
    });
    const inList = (t: TaskItem) => selectedList === "all" || (t.listId ?? null) === selectedList;
    const listed = inMode.filter(inList);
    return {
      active: listed.filter((t) => !t.isArchived && !isTaskDone(t)).sort((a, b) => compareTasksByDue(a, b)),
      done: listed.filter((t) => !t.isArchived && isTaskDone(t)).sort((a, b) => (b.lastCompletedAt ?? "").localeCompare(a.lastCompletedAt ?? "")),
      archived: listed.filter((t) => t.isArchived).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [tasks, mode, selectedList]);

  // Active reminders (already filtered to the selected list) are grouped by
  // when they're due — Overdue, Today, Next week, In two weeks, Next month,
  // Later — each kept in the same soonest-first order within its section.
  const timeGroups = useMemo(() => {
    const now = new Date();
    const byBucket = new Map<string, TaskItem[]>();
    for (const t of active) {
      const b = taskTimeBucket(t, now);
      (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(t);
    }
    return TASK_TIME_BUCKET_ORDER.map((bucket) => ({ bucket, tasks: byBucket.get(bucket) ?? [] })).filter((g) => g.tasks.length > 0);
  }, [active]);

  if (composing || editing) {
    return (
      <TaskForm
        accent={accent}
        recurrenceMode={mode === "recurring" ? "required" : mode === "all" ? "optional" : "none"}
        assignable={assignable}
        lists={lists}
        defaultListId={selectedList === "all" ? null : selectedList}
        initial={editing ?? undefined}
        onSave={async (values) => {
          if (editing) await onEdit(editing.id, values);
          else await onCreate(values);
          setComposing(false);
          setEditing(null);
        }}
        onCancel={() => {
          setComposing(false);
          setEditing(null);
        }}
      />
    );
  }

  const nothing = active.length === 0 && done.length === 0 && archived.length === 0;

  /** Trailing row actions — the normal icon cluster, or an inline
   * "Delete / Keep" confirm once the trash icon is tapped. Matches the
   * NoteRow / Manage / Doctors pattern; never a native confirm dialog. */
  const rowActions = (taskId: string, icons: ReactNode) =>
    confirmingDeleteId === taskId ? (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setConfirmingDeleteId(null);
            void onDelete(taskId);
          }}
          className="rounded-md px-2 py-1 text-xs font-semibold"
          style={{ color: "var(--status-critical)" }}
        >
          Delete
        </button>
        <button type="button" onClick={() => setConfirmingDeleteId(null)} className="rounded-md px-2 py-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Keep
        </button>
      </span>
    ) : (
      <div className="flex shrink-0 items-center gap-4">{icons}</div>
    );

  const activeListRow = (task: TaskItem) => {
    const recurring = isRecurringTask(task);
    const due = isTaskDue(task);
    return (
      <div key={task.id} className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
        <button
          type="button"
          onClick={() => void onComplete(task)}
          aria-label={recurring ? "Mark done for this cycle" : "Mark done"}
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--baseline)", background: "transparent" }}
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {task.title}
          </span>
          {task.notes && (
            <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-secondary)" }}>
              {task.notes}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: due ? "var(--status-critical)" : "var(--text-muted)" }}>
            {lists && (
              <select
                value={task.listId ?? ""}
                onChange={(e) => void onEdit(task.id, taskToFormValues(task, { listId: e.target.value || null }))}
                aria-label={`Move "${task.title}" to another list`}
                className="max-w-[10rem] truncate rounded border py-0.5 pr-1 pl-1.5 text-xs outline-none"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
              >
                <option value="">{DEFAULT_LIST_NAME}</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            {recurring && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-semibold"
                style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
              >
                every {task.recurrenceDays}d
              </span>
            )}
            {task.dueAt && <span>{recurring ? `Next: ${formatDueAt(task.dueAt)}` : formatDueAt(task.dueAt)}</span>}
            {completedByLabel && task.assignedTo && <span style={{ color: "var(--text-muted)" }}>· for {completedByLabel(task.assignedTo)}</span>}
            {task.lastCompletedAt && (
              <span style={{ color: "var(--text-muted)" }}>
                · last done {formatDate(task.lastCompletedAt)}
                {completedByLabel && task.lastCompletedBy ? ` by ${completedByLabel(task.lastCompletedBy)}` : ""}
              </span>
            )}
          </span>
        </div>
        {rowActions(
          task.id,
          <>
            <IconAction onClick={() => setEditing(task)} label="Edit"><PencilIcon size={15} /></IconAction>
            {task.lastCompletedAt && (
              <IconAction onClick={() => void onUncomplete(task)} label="Undo last done"><UndoIcon size={15} /></IconAction>
            )}
            <IconAction onClick={() => void onArchive(task.id, true)} label="Archive"><ArchiveIcon size={15} /></IconAction>
            <IconAction onClick={() => setConfirmingDeleteId(task.id)} label="Delete" tone="critical"><TrashIcon size={15} /></IconAction>
          </>,
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {lists && onCreateList && (
        <ListStrip
          lists={lists}
          counts={listCounts}
          selected={selectedList}
          accent={accent}
          onSelect={setSelectedList}
          onCreate={(name) => void onCreateList(name).then((id) => setSelectedList(id))}
        />
      )}

      <div className="hidden items-center justify-end gap-3 lg:flex">
        <PrimaryAction label="New reminder" accent={accent} onClick={() => setComposing(true)} />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load tasks — try again in a moment.
        </p>
      ) : nothing ? (
        <InlineEmpty
          title={selectedList === "all" ? emptyTitle : `Nothing in ${listName(selectedList === "all" ? null : selectedList)}`}
          description={emptyDescription}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:grid xl:grid-cols-2 xl:items-start">
            {timeGroups.map(({ bucket, tasks }) => (
              <ListSection
                key={bucket}
                label={TASK_TIME_BUCKET_LABEL[bucket]}
                count={tasks.length}
                accent={bucket === "overdue" ? SOFT_OVERDUE : bucket === "today" ? "var(--status-serious)" : undefined}
                icon={
                  <SectionIcon>
                    <circle cx="10" cy="11" r="6.2" />
                    <path d="M10 7.6V11l2.4 1.6M10 2.6V4" />
                  </SectionIcon>
                }
              >
                <div className="flex flex-col">{tasks.map(activeListRow)}</div>
              </ListSection>
            ))}
          </div>

          {done.length > 0 && (
            <CollapsibleGroup title="Done" count={done.length}>
              {done.map((task) => (
                <div key={task.id} className="flex items-center gap-3 border-t py-3 pr-1 pl-1 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                  <button
                    type="button"
                    onClick={() => void onUncomplete(task)}
                    aria-label="Undo — mark not done"
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
                    style={{ borderColor: "var(--status-good)", background: "var(--status-good)" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M4 10.5 8 14.5 16 5.5" />
                    </svg>
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium line-through" style={{ color: "var(--text-muted)" }}>
                      {task.title}
                    </span>
                    {task.lastCompletedAt && (
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                        done {formatDate(task.lastCompletedAt)}
                        {completedByLabel && task.lastCompletedBy ? ` by ${completedByLabel(task.lastCompletedBy)}` : ""}
                      </span>
                    )}
                  </span>
                  {rowActions(
                    task.id,
                    <>
                      <IconAction onClick={() => void onUncomplete(task)} label="Undo"><UndoIcon size={15} /></IconAction>
                      <IconAction onClick={() => void onArchive(task.id, true)} label="Archive"><ArchiveIcon size={15} /></IconAction>
                      <IconAction onClick={() => setConfirmingDeleteId(task.id)} label="Delete" tone="critical"><TrashIcon size={15} /></IconAction>
                    </>,
                  )}
                </div>
              ))}
            </CollapsibleGroup>
          )}

          {archived.length > 0 && (
            <CollapsibleGroup title="Archived" count={archived.length}>
              {archived.map((task) => (
                <div key={task.id} className="flex items-center gap-3 border-t py-3 pr-1 pl-1 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                      {isRecurringTask(task) ? `every ${task.recurrenceDays}d` : "one-off"}
                      {task.lastCompletedAt ? ` · last done ${formatDate(task.lastCompletedAt)}` : ""}
                    </span>
                  </span>
                  {rowActions(
                    task.id,
                    <>
                      <IconAction onClick={() => void onArchive(task.id, false)} label="Unarchive"><UndoIcon size={15} /></IconAction>
                      <IconAction onClick={() => setConfirmingDeleteId(task.id)} label="Delete" tone="critical"><TrashIcon size={15} /></IconAction>
                    </>,
                  )}
                </div>
              ))}
            </CollapsibleGroup>
          )}
        </div>
      )}
    </div>
  );
}
