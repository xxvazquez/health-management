"use client";

import { useState, type FormEvent } from "react";
import type { Doctor, DoctorAppointment, DoctorFollowUpTask, FollowUpTaskPatch, NewFollowUpTaskInput } from "@/lib/supabase/doctors";
import { DoctorName, FIELD_CLS, FIELD_STYLE, IconAction, LABEL_STYLE, PencilIcon, TrashIcon, formatDateTime } from "./shared";
import { FollowUpTaskRow } from "./FollowUpTaskRow";

/** One appointment in a history list: doctor (when shown) + its frozen
 * specialty + date/time, reason, follow-up notes, and the follow-up task
 * checklist with inline add. Edit/delete act on the appointment itself. */
export function AppointmentCard({
  appointment,
  doctor,
  tasks,
  accent,
  showDoctor = true,
  onEdit,
  onDelete,
  onAddTask,
  onEditTask,
  onToggleTask,
  onDeleteTask,
}: {
  appointment: DoctorAppointment;
  doctor: Doctor | undefined;
  tasks: DoctorFollowUpTask[];
  accent: string;
  showDoctor?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddTask: (input: NewFollowUpTaskInput) => void;
  onEditTask: (id: string, patch: FollowUpTaskPatch) => void;
  onToggleTask: (id: string, done: boolean) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState("");

  const openTasks = tasks.filter((t) => !t.completedAt);
  const doneTasks = tasks.filter((t) => t.completedAt);

  function submitTask(e: FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    onAddTask({ description: newTask.trim(), dueDate: null, reminderAt: null });
    setNewTask("");
    setAddingTask(false);
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showDoctor && (
            <div className="text-sm">
              <DoctorName name={doctor?.name ?? "Unknown doctor"} rating={doctor?.rating ?? null} />
              <span style={{ color: "var(--text-muted)" }}> · {appointment.specialty}</span>
            </div>
          )}
          <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            {formatDateTime(appointment.appointmentAt)}
            {!showDoctor && <span style={{ color: "var(--text-muted)" }}> · {appointment.specialty}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <IconAction onClick={onEdit} label="Edit appointment">
            <PencilIcon size={15} />
          </IconAction>
          <IconAction onClick={() => setConfirmDelete(true)} label="Delete appointment" tone="critical">
            <TrashIcon size={15} />
          </IconAction>
        </div>
      </div>

      {confirmDelete && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Delete this appointment? Its follow-up tasks go too; the doctor and other visits stay.</span>
          <button type="button" onClick={onDelete} className="rounded-md px-2 py-1 font-semibold" style={{ color: "var(--status-critical)" }}>
            Delete
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 font-medium" style={{ color: "var(--text-muted)" }}>
            Keep
          </button>
        </div>
      )}

      {appointment.reason && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-primary)" }}>
          {appointment.reason}
        </p>
      )}
      {appointment.followUpNotes && (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
          {appointment.followUpNotes}
        </p>
      )}

      <div className="mt-3 border-t pt-1" style={{ borderColor: "var(--gridline)" }}>
        {openTasks.map((task) => (
          <FollowUpTaskRow
            key={task.id}
            task={task}
            accent={accent}
            onToggle={(done) => onToggleTask(task.id, done)}
            onEdit={(patch) => onEditTask(task.id, patch)}
            onDelete={() => onDeleteTask(task.id)}
          />
        ))}
        {doneTasks.map((task) => (
          <FollowUpTaskRow
            key={task.id}
            task={task}
            accent={accent}
            onToggle={(done) => onToggleTask(task.id, done)}
            onEdit={(patch) => onEditTask(task.id, patch)}
            onDelete={() => onDeleteTask(task.id)}
          />
        ))}

        {addingTask ? (
          <form onSubmit={submitTask} className="flex items-center gap-2 py-2">
            <input autoFocus value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="e.g. Do the USG" className={`${FIELD_CLS} flex-1`} style={FIELD_STYLE} />
            <button type="submit" disabled={!newTask.trim()} className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              Add
            </button>
            <button type="button" onClick={() => setAddingTask(false)} className="text-xs" style={LABEL_STYLE}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAddingTask(true)} className="py-2 text-xs font-medium underline decoration-dotted" style={{ color: accent }}>
            + Add follow-up task
          </button>
        )}
      </div>
    </div>
  );
}
