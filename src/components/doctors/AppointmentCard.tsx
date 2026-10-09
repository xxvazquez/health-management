"use client";

import { useState } from "react";
import type { DoctorAppointment, DoctorFollowUpTask, FollowUpTaskPatch, NewFollowUpTaskInput } from "@/lib/supabase/doctors";
import { MarkdownContent } from "@/components/ui/Markdown";
import { FormGroup } from "@/components/ui/FormGroup";
import { FollowUpTaskRow, FollowUpTaskSheet } from "./FollowUpTaskRow";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** A visit's detail, shown inside its sheet: reason and follow-up notes,
 * comments, then the follow-up checklist (tap one to edit it) and Delete
 * visit at the bottom, as in Calendar. Editing the visit itself is the
 * sheet's Edit action. */
export function AppointmentCard({
  appointment,
  tasks,
  accent,
  onDelete,
  onAddTask,
  onEditTask,
  onToggleTask,
  onDeleteTask,
}: {
  appointment: DoctorAppointment;
  tasks: DoctorFollowUpTask[];
  accent: string;
  onDelete: () => void;
  onAddTask: (input: NewFollowUpTaskInput) => void;
  onEditTask: (id: string, patch: FollowUpTaskPatch) => void;
  onToggleTask: (id: string, done: boolean) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [taskSheet, setTaskSheet] = useState<DoctorFollowUpTask | "new" | null>(null);

  const ordered = [...tasks.filter((t) => !t.completedAt), ...tasks.filter((t) => t.completedAt)];

  return (
    <div className="flex flex-col gap-5">
      {(appointment.reason || appointment.followUpNotes) && (
        <FormGroup>
          <div className="flex flex-col gap-1.5 px-3.5 py-3">
            {appointment.reason && (
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {appointment.reason}
              </p>
            )}
            {appointment.followUpNotes && (
              <div className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <MarkdownContent>{appointment.followUpNotes}</MarkdownContent>
              </div>
            )}
          </div>
        </FormGroup>
      )}

      {appointment.notes && (
        <FormGroup title="Comments">
          <div className="px-3.5 py-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <MarkdownContent>{appointment.notes}</MarkdownContent>
          </div>
        </FormGroup>
      )}

      <FormGroup title="Follow-ups">
        <ul className="inset-rows [--row-inset:2.75rem]">
          {ordered.map((task) => (
            <FollowUpTaskRow key={task.id} task={task} onToggle={(done) => onToggleTask(task.id, done)} onOpen={() => setTaskSheet(task)} />
          ))}
          <li>
            <button type="button" onClick={() => setTaskSheet("new")} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: accent }}>
              Add follow-up
            </button>
          </li>
        </ul>
      </FormGroup>

      <FormGroup>
        <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 w-full items-center justify-center text-sm font-medium" style={{ color: "var(--status-critical)" }}>
          Delete visit
        </button>
      </FormGroup>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this visit?"
          message="Its follow-ups are deleted too. The doctor and other visits stay."
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}

      {taskSheet && (
        <FollowUpTaskSheet
          task={taskSheet === "new" ? null : taskSheet}
          accent={accent}
          onSave={(input) => (taskSheet === "new" ? onAddTask(input) : onEditTask(taskSheet.id, input))}
          onDelete={taskSheet === "new" ? undefined : () => onDeleteTask(taskSheet.id)}
          onClose={() => setTaskSheet(null)}
        />
      )}
    </div>
  );
}
