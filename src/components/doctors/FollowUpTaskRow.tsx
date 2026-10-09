"use client";

import { DatePicker, DateTimePicker } from "@/components/ui/DatePicker";
import { useState, type FormEvent } from "react";
import type { DoctorFollowUpTask, NewFollowUpTaskInput } from "@/lib/supabase/doctors";
import { formatDateTime, formatShortDate, toLocalInput } from "./shared";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { FormShell } from "@/components/ui/FormShell";
import { ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChevronIcon } from "@/components/ui/icons";

/** One follow-up task as a grouped-list row: a completion circle, then its
 * text and due/reminder line. Tapping the text opens it to edit. */
export function FollowUpTaskRow({ task, onToggle, onOpen }: { task: DoctorFollowUpTask; onToggle: (done: boolean) => void; onOpen: () => void }) {
  const done = task.completedAt != null;
  const meta = [
    task.dueDate && `Due ${formatShortDate(task.dueDate)}`,
    task.reminderAt && `Reminder ${formatDateTime(task.reminderAt)}`,
    done && task.completedAt && `Done ${formatShortDate(task.completedAt)}`,
  ].filter(Boolean);

  return (
    <li className="flex min-h-11 items-center gap-3 pl-3.5 pr-3">
      <button
        type="button"
        onClick={() => onToggle(!done)}
        aria-label={done ? `Mark "${task.description}" not done` : `Mark "${task.description}" done`}
        aria-pressed={done}
        className={`tap-target flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${done ? "" : "hover:border-[var(--status-good)]"}`}
        style={{ borderColor: done ? "var(--status-good)" : "var(--text-secondary)", background: done ? "var(--status-good)" : "transparent" }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="var(--on-accent)" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M4 10.5 8 14.5 16 5.5" />
          </svg>
        )}
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`text-sm ${done ? "line-through" : ""}`} style={{ color: done ? "var(--text-muted)" : "var(--text-primary)" }}>
            {task.description}
          </span>
          {meta.length > 0 && (
            <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {meta.join(" · ")}
            </span>
          )}
        </span>
        <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
          <ChevronIcon size={14} />
        </span>
      </button>
    </li>
  );
}

/** Add a follow-up task to a visit, or edit/delete an existing one. */
export function FollowUpTaskSheet({
  task,
  accent,
  onSave,
  onDelete,
  onClose,
}: {
  task: DoctorFollowUpTask | null;
  accent: string;
  onSave: (input: NewFollowUpTaskInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [reminderAt, setReminderAt] = useState(task?.reminderAt ? toLocalInput(task.reminderAt) : "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    onSave({ description: description.trim(), dueDate: dueDate || null, reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null });
    onClose();
  }

  return (
    <FormShell title={task ? "Follow-up" : "New follow-up"} onSubmit={submit} onCancel={onClose} submitLabel={task ? "Done" : "Add"} submitDisabled={!description.trim()} accent={accent}>
      <FormGroup>
        <div className="px-3.5">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Book the CT scan"
            aria-label="Task"
            autoFocus={!task}
            className={`${ROW_TEXT_CLS} min-h-11`}
            style={ROW_STYLE}
          />
        </div>
        <Field label="Due date" inline>
          <DatePicker value={dueDate} onChange={setDueDate} optional title="Due date" />
        </Field>
        <Field label="Reminder" inline>
          <DateTimePicker value={reminderAt} onChange={setReminderAt} optional title="Reminder" />
        </Field>
      </FormGroup>

      {onDelete && (
        <FormGroup>
          <button type="button" onClick={() => setConfirmingDelete(true)} className="flex min-h-11 w-full items-center justify-center text-sm font-medium" style={{ color: "var(--status-critical)" }}>
            Delete follow-up
          </button>
          {confirmingDelete && (
            <ConfirmDialog
              title="Delete this follow-up?"
              message="This can't be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={() => {
                setConfirmingDelete(false);
                onDelete();
                onClose();
              }}
              onClose={() => setConfirmingDelete(false)}
            />
          )}
        </FormGroup>
      )}
    </FormShell>
  );
}
