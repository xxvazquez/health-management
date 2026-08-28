"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { isRecurringTask, isTaskDone, isTaskDue, type TaskItem } from "@/lib/reminders";

export type TaskBoardMode = "one-off" | "recurring" | "all";

/** The fields a create/edit form hands back — same tuple for both, so a
 * parent can point `onCreate` and `onEdit` at the same handler shape. */
export type TaskFormValues = {
  title: string;
  notes: string;
  dueAt: string | null;
  recurrenceDays: number | null;
  assignedTo: string | null;
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
 * switches the button to "Save changes". `allowRecurrence` still controls
 * whether the "repeat every N days" field appears at all. */
function TaskForm({
  accent,
  recurrenceMode,
  assignable,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  recurrenceMode: "none" | "optional" | "required";
  /** Home only — when set, offers an "Assigned to" dropdown (Anyone/Me/
   * Partner). Personal tasks have no second person to assign to. */
  assignable?: { myUserId: string; partnerId: string | null };
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
      });
    } catch (err) {
      console.error("task save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
      <input
        required
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        maxLength={150}
        className="rounded-md border px-3 py-2 text-sm font-medium outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Notes (optional)"
        className="resize-y rounded-md border px-3 py-2.5 text-sm leading-relaxed outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />

      {assignable && (
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Assigned to
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          >
            <option value="">Anyone</option>
            <option value={assignable.myUserId}>Me</option>
            {assignable.partnerId && <option value={assignable.partnerId}>Partner</option>}
          </select>
        </label>
      )}

      {recurrenceMode === "optional" && (
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeats on a schedule
        </label>
      )}

      {usesRecurrence ? (
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Repeat every
          <input
            type="number"
            min={1}
            required
            value={recurrenceDays}
            onChange={(e) => setRecurrenceDays(e.target.value)}
            className="w-16 rounded-md border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
          days
        </label>
      ) : (
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Deadline (optional)
          <input
            type="datetime-local"
            value={dueAtLocal}
            onChange={(e) => setDueAtLocal(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
        </label>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Save"}
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

function RowButton({ onClick, children, tone = "muted", disabled }: { onClick: () => void; children: ReactNode; tone?: "muted" | "critical"; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40"
      style={{ color: tone === "critical" ? "var(--status-critical)" : "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
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
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? "" : "-rotate-90"}
          aria-hidden="true"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
        {title} ({count})
      </button>
      {open && <div className="mt-1 flex flex-col">{children}</div>}
    </div>
  );
}

export function TaskBoard({
  tasks,
  loading,
  error,
  accent,
  mode,
  assignable,
  onCreate,
  onEdit,
  onComplete,
  onUncomplete,
  onArchive,
  onDelete,
  completedByLabel,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Tap + New to add one.",
}: {
  tasks: TaskItem[];
  loading: boolean;
  error: boolean;
  accent: string;
  mode: TaskBoardMode;
  /** Home only — see TaskForm's own doc comment. */
  assignable?: { myUserId: string; partnerId: string | null };
  onCreate: (values: TaskFormValues) => Promise<void>;
  onEdit: (id: string, values: TaskFormValues) => Promise<void>;
  onComplete: (task: TaskItem) => Promise<void>;
  onUncomplete: (task: TaskItem) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Home only — resolves a task's `lastCompletedBy`/`assignedTo` into
   * "you"/"your partner" without ever surfacing a raw email (same privacy
   * stance Notes takes with the partner's identity). */
  completedByLabel?: (userId: string) => string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { active, done, archived } = useMemo(() => {
    const inMode = tasks.filter((t) => {
      if (mode === "one-off") return !isRecurringTask(t);
      if (mode === "recurring") return isRecurringTask(t);
      return true;
    });
    const sortByDue = (list: TaskItem[]) =>
      [...list].sort((a, b) => {
        if (isTaskDue(a) !== isTaskDue(b)) return isTaskDue(a) ? -1 : 1;
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.localeCompare(b.dueAt);
      });
    return {
      active: sortByDue(inMode.filter((t) => !t.isArchived && !isTaskDone(t))),
      done: inMode
        .filter((t) => !t.isArchived && isTaskDone(t))
        .sort((a, b) => (b.lastCompletedAt ?? "").localeCompare(a.lastCompletedAt ?? "")),
      archived: inMode.filter((t) => t.isArchived).sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [tasks, mode]);

  if (composing || editing) {
    return (
      <TaskForm
        accent={accent}
        recurrenceMode={mode === "recurring" ? "required" : mode === "all" ? "optional" : "none"}
        assignable={assignable}
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setComposing(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }}>
          + New
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load tasks — try again in a moment.
        </p>
      ) : nothing ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--border-hairline)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {emptyTitle}
          </p>
          <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
            {emptyDescription}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {active.map((task) => {
            const recurring = isRecurringTask(task);
            const due = isTaskDue(task);
            const expanded = expandedId === task.id;
            return (
              <div key={task.id} className="border-t py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                <div className="flex items-start gap-3 pr-1 pl-2">
                  <button
                    type="button"
                    onClick={() => void onComplete(task)}
                    aria-label={recurring ? "Mark done for this cycle" : "Mark done"}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                    style={{ borderColor: "var(--border-hairline)", background: "transparent" }}
                  />
                  <button type="button" onClick={() => setExpandedId(expanded ? null : task.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {task.title}
                    </span>
                    {task.notes && (
                      <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                        {task.notes}
                      </span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: due ? "var(--status-critical)" : "var(--text-muted)" }}>
                      {task.dueAt && <span>{recurring ? `Next: ${formatDueAt(task.dueAt)}` : formatDueAt(task.dueAt)}</span>}
                      {recurring && <span style={{ color: "var(--text-muted)" }}>· every {task.recurrenceDays}d</span>}
                      {completedByLabel && task.assignedTo && <span style={{ color: "var(--text-muted)" }}>· for {completedByLabel(task.assignedTo)}</span>}
                      {task.lastCompletedAt && (
                        <span style={{ color: "var(--text-muted)" }}>
                          · last done {formatDate(task.lastCompletedAt)}
                          {completedByLabel && task.lastCompletedBy ? ` by ${completedByLabel(task.lastCompletedBy)}` : ""}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
                {expanded && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 pl-10">
                    <RowButton onClick={() => setEditing(task)}>Edit</RowButton>
                    {task.lastCompletedAt && <RowButton onClick={() => void onUncomplete(task)}>Undo last done</RowButton>}
                    <RowButton onClick={() => void onArchive(task.id, true)}>Archive</RowButton>
                    <RowButton onClick={() => void onDelete(task.id)} tone="critical">
                      Delete
                    </RowButton>
                  </div>
                )}
              </div>
            );
          })}

          {done.length > 0 && (
            <CollapsibleGroup title="Done" count={done.length}>
              {done.map((task) => (
                <div key={task.id} className="flex items-start gap-3 border-t py-3 pr-1 pl-2 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                  <button
                    type="button"
                    onClick={() => void onUncomplete(task)}
                    aria-label="Undo — mark not done"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                    style={{ borderColor: "var(--status-good)", background: "var(--status-good)" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M4 10.5 8 14.5 16 5.5" />
                    </svg>
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium line-through" style={{ color: "var(--text-muted)" }}>
                      {task.title}
                    </span>
                    {task.lastCompletedAt && (
                      <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                        done {formatDate(task.lastCompletedAt)}
                        {completedByLabel && task.lastCompletedBy ? ` by ${completedByLabel(task.lastCompletedBy)}` : ""}
                      </span>
                    )}
                  </span>
                  <RowButton onClick={() => void onUncomplete(task)}>Undo</RowButton>
                  <RowButton onClick={() => void onArchive(task.id, true)}>Archive</RowButton>
                  <RowButton onClick={() => void onDelete(task.id)} tone="critical">
                    Delete
                  </RowButton>
                </div>
              ))}
            </CollapsibleGroup>
          )}

          {archived.length > 0 && (
            <CollapsibleGroup title="Archived" count={archived.length}>
              {archived.map((task) => (
                <div key={task.id} className="flex items-start gap-3 border-t py-3 pr-1 pl-2 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {isRecurringTask(task) ? `every ${task.recurrenceDays}d` : "one-off"}
                      {task.lastCompletedAt ? ` · last done ${formatDate(task.lastCompletedAt)}` : ""}
                    </span>
                  </span>
                  <RowButton onClick={() => void onArchive(task.id, false)}>Unarchive</RowButton>
                  <RowButton onClick={() => void onDelete(task.id)} tone="critical">
                    Delete
                  </RowButton>
                </div>
              ))}
            </CollapsibleGroup>
          )}
        </div>
      )}
    </div>
  );
}
