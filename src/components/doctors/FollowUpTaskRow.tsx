"use client";

import { useState, type ReactNode } from "react";
import type { DoctorFollowUpTask, FollowUpTaskPatch } from "@/lib/supabase/doctors";
import { FIELD_CLS, FIELD_STYLE, IconAction, LABEL_STYLE, PencilIcon, TrashIcon, formatDate, formatDateTime, toLocalInput } from "./shared";

/** One follow-up task — a completion checkbox, its text + due/reminder
 * meta, and edit/delete. Shared by the appointment card and the Follow-ups
 * tab (which passes `context` to name the doctor/specialty). */
export function FollowUpTaskRow({
  task,
  accent,
  context,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: DoctorFollowUpTask;
  accent: string;
  context?: ReactNode;
  onToggle: (done: boolean) => void;
  onEdit: (patch: FollowUpTaskPatch) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [reminderAt, setReminderAt] = useState(task.reminderAt ? toLocalInput(task.reminderAt) : "");
  const done = task.completedAt != null;

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border-t py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs" style={LABEL_STYLE}>
            Due date · optional
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={LABEL_STYLE}>
            Reminder · optional
            <input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!description.trim()) return;
              onEdit({ description: description.trim(), dueDate: dueDate || null, reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null });
              setEditing(false);
            }}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: accent }}
          >
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
      <button
        type="button"
        onClick={() => onToggle(!done)}
        aria-label={done ? "Mark not done" : "Mark done"}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
        style={{ borderColor: done ? "var(--status-good)" : "var(--baseline)", background: done ? "var(--status-good)" : "transparent" }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round">
            <path d="M4 10.5 8 14.5 16 5.5" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        {context && <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{context}</span>}
        <span className={`block text-sm ${done ? "line-through" : "font-medium"}`} style={{ color: done ? "var(--text-muted)" : "var(--text-primary)" }}>
          {task.description}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {task.dueDate && <span>Due {formatDate(task.dueDate)}</span>}
          {task.reminderAt && <span>· Reminder {formatDateTime(task.reminderAt)}</span>}
          {done && task.completedAt && <span>· done {formatDate(task.completedAt)}</span>}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4 self-center">
        {confirmingDelete ? (
          <>
            <button type="button" onClick={onDelete} className="rounded-md px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
              Delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Keep
            </button>
          </>
        ) : (
          <>
            <IconAction onClick={() => setEditing(true)} label="Edit task">
              <PencilIcon size={15} />
            </IconAction>
            <IconAction onClick={() => setConfirmingDelete(true)} label="Delete task" tone="critical">
              <TrashIcon size={15} />
            </IconAction>
          </>
        )}
      </div>
    </div>
  );
}
