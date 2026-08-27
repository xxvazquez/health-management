"use client";

import { useMemo, useState, type FormEvent } from "react";
import { isRecurringTask, isTaskDone, isTaskDue, type TaskItem } from "@/lib/reminders";

export type TaskBoardMode = "one-off" | "recurring" | "all";

function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** New-task form. `allowRecurrence` controls whether a "repeat every N
 * days" field is offered at all — Personal splits Tasks/Recurring into two
 * tabs each with its own fixed shape, so only the Recurring tab passes a
 * form that always sets a recurrence; Home's single Tasks tab passes
 * "optional", letting either kind be created from one form. */
function TaskForm({
  accent,
  recurrenceMode,
  assignable,
  onSave,
  onCancel,
}: {
  accent: string;
  recurrenceMode: "none" | "optional" | "required";
  /** Home only — when set, offers an "Assigned to" dropdown (Anyone/Me/
   * Partner). Personal tasks have no second person to assign to, so this
   * is left undefined there and the dropdown doesn't render at all. */
  assignable?: { myUserId: string; partnerId: string | null };
  onSave: (title: string, notes: string, dueAt: string | null, recurrenceDays: number | null, assignedTo: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [recurring, setRecurring] = useState(recurrenceMode === "required");
  const [recurrenceDays, setRecurrenceDays] = useState(recurrenceMode === "required" ? "7" : "");
  const [assignedTo, setAssignedTo] = useState("");
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
      const dueAt = dueAtLocal ? new Date(dueAtLocal).toISOString() : usesRecurrence ? new Date(Date.now() + Number(recurrenceDays) * 86_400_000).toISOString() : null;
      await onSave(title, notes, dueAt, usesRecurrence ? Number(recurrenceDays) : null, assignedTo || null);
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
          {saving ? "Saving…" : "Save"}
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

export function TaskBoard({
  tasks,
  loading,
  error,
  accent,
  mode,
  assignable,
  onCreate,
  onComplete,
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
  onCreate: (title: string, notes: string, dueAt: string | null, recurrenceDays: number | null, assignedTo: string | null) => Promise<void>;
  onComplete: (task: TaskItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Home only — resolves a task's `lastCompletedBy`/`assignedTo` into
   * "you"/"your partner" without ever surfacing a raw email (same privacy
   * stance Notes takes with the partner's identity). */
  completedByLabel?: (userId: string) => string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (mode === "one-off") return !isRecurringTask(t);
      if (mode === "recurring") return isRecurringTask(t);
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aDone = isTaskDone(a);
      const bDone = isTaskDone(b);
      if (aDone !== bDone) return aDone ? 1 : -1; // done tasks sink to the bottom
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    });
  }, [tasks, mode]);

  if (composing) {
    return (
      <TaskForm
        accent={accent}
        recurrenceMode={mode === "recurring" ? "required" : mode === "all" ? "optional" : "none"}
        assignable={assignable}
        onSave={async (title, notes, dueAt, recurrenceDays, assignedTo) => {
          await onCreate(title, notes, dueAt, recurrenceDays, assignedTo);
          setComposing(false);
        }}
        onCancel={() => setComposing(false)}
      />
    );
  }

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
      ) : visibleTasks.length === 0 ? (
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
          {visibleTasks.map((task) => {
            const recurring = isRecurringTask(task);
            const done = isTaskDone(task);
            const due = isTaskDue(task);
            const expanded = expandedId === task.id;
            return (
              <div key={task.id} className="border-t py-3.5 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                <div className="flex items-start gap-3 pr-1 pl-2">
                  <button
                    type="button"
                    onClick={() => void onComplete(task)}
                    disabled={done}
                    aria-label={recurring ? "Mark done for this cycle" : "Mark done"}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border disabled:opacity-40"
                    style={{ borderColor: done ? "var(--status-good)" : "var(--border-hairline)", background: done ? "var(--status-good)" : "transparent" }}
                  >
                    {done && (
                      <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M4 10.5 8 14.5 16 5.5" />
                      </svg>
                    )}
                  </button>
                  <button type="button" onClick={() => setExpandedId(expanded ? null : task.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium" style={{ color: done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}>
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
                  <button
                    type="button"
                    onClick={() => void onDelete(task.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium"
                    style={{ color: "var(--status-critical)" }}
                    aria-label="Delete task"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
