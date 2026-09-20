"use client";

import { useState, type FormEvent } from "react";
import type { Doctor, DoctorAppointment } from "@/lib/supabase/doctors";
import type { DoctorLanguage } from "@/lib/doctors";
import type { LogAppointmentInput } from "@/lib/useDoctors";
import { ComboBox, DoctorName, LanguageChips, RatingChips, TrashIcon, toLocalDateInput } from "./shared";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { MarkdownField } from "@/components/ui/Markdown";
import { todayLocalISODate } from "@/lib/aggregations/common";

interface TaskDraft {
  description: string;
  dueDate: string;
  reminderAt: string;
}

/** Log a new appointment, or edit an existing one's own fields (the doctor
 * and follow-up tasks of an existing appointment are managed from its
 * card, not here). */
export function AppointmentForm({
  accent,
  doctors,
  specialtyOptions,
  initial,
  initialDoctor,
  onCreate,
  onEdit,
  onCancel,
}: {
  accent: string;
  doctors: Doctor[];
  specialtyOptions: string[];
  initial?: DoctorAppointment;
  initialDoctor?: Doctor;
  onCreate: (input: LogAppointmentInput) => Promise<void>;
  onEdit: (id: string, patch: { appointmentAt: string; reason: string; followUpNotes: string; notes: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = initial != null;

  const [doctorName, setDoctorName] = useState(initialDoctor?.name ?? "");
  const [specialty, setSpecialty] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [language, setLanguage] = useState<DoctorLanguage | null>(null);

  const [appointmentDate, setAppointmentDate] = useState(initial ? toLocalDateInput(initial.appointmentAt) : todayLocalISODate());
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [followUpNotes, setFollowUpNotes] = useState(initial?.followUpNotes ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tasks, setTasks] = useState<TaskDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchedDoctor = doctors.find((d) => d.name.trim().toLowerCase() === doctorName.trim().toLowerCase()) ?? null;
  const isNewDoctor = !editing && doctorName.trim().length > 0 && !matchedDoctor;

  function addTaskRow() {
    setTasks((prev) => [...prev, { description: "", dueDate: "", reminderAt: "" }]);
  }
  function setTaskRow(index: number, patch: Partial<TaskDraft>) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function removeTaskRow(index: number) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!appointmentDate) return;
    setSaving(true);
    setError(null);
    // Stored as a timestamp for sort order, but only the date is asked for —
    // pinned to local noon so no timezone conversion can shift the day.
    const appointmentAt = new Date(`${appointmentDate}T12:00:00`).toISOString();
    try {
      if (editing) {
        await onEdit(initial.id, { appointmentAt, reason, followUpNotes, notes });
      } else {
        if (!doctorName.trim()) {
          setError("Pick or add a doctor.");
          setSaving(false);
          return;
        }
        if (isNewDoctor && !specialty.trim()) {
          setError("Choose a specialty for the new doctor.");
          setSaving(false);
          return;
        }
        const cleanTasks = tasks
          .filter((t) => t.description.trim())
          .map((t) => ({
            description: t.description.trim(),
            dueDate: t.dueDate || null,
            reminderAt: t.reminderAt ? new Date(t.reminderAt).toISOString() : null,
          }));
        await onCreate({
          doctorId: matchedDoctor?.id ?? null,
          newDoctor: isNewDoctor ? { name: doctorName.trim(), specialty: specialty.trim(), rating, language, notes: null } : null,
          appointmentAt,
          reason,
          followUpNotes,
          notes,
          tasks: cleanTasks,
        });
      }
    } catch (err) {
      console.error("appointment save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell title={editing ? "Edit appointment" : "Log appointment"} onSubmit={handleSubmit} onCancel={onCancel}>
      <FormGroup>
        <Field label="Doctor" plain>
          {editing ? (
            <span className="py-0.5 text-sm" style={{ color: "var(--text-primary)" }}>
              <DoctorName name={initialDoctor?.name ?? "—"} rating={initialDoctor?.rating ?? null} /> · {initial.specialty}
            </span>
          ) : (
            <ComboBox
              bare
              value={doctorName}
              onChange={setDoctorName}
              options={doctors.map((d) => d.name)}
              placeholder="Search or add a doctor…"
              accent={accent}
              renderOption={(name) => {
                const d = doctors.find((x) => x.name === name);
                return <DoctorName name={name} rating={d?.rating ?? null} weight="font-normal" />;
              }}
            />
          )}
        </Field>
        <Field label="Date" inline>
          <input type="date" required max={todayLocalISODate()} value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className={ROW_INLINE_CLS} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      {isNewDoctor && (
        <FormGroup title="New doctor" footer="Saved for reuse.">
          <Field label="Specialty" plain>
            <ComboBox bare value={specialty} onChange={setSpecialty} options={specialtyOptions} placeholder="Search or add a specialty…" accent={accent} />
          </Field>
          <Field label={<>Rating <span style={{ color: "var(--text-muted)" }}>· optional</span></>} plain className="gap-1.5">
            <RatingChips value={rating} onChange={setRating} accent={accent} />
          </Field>
          <Field label={<>Language <span style={{ color: "var(--text-muted)" }}>· optional</span></>} plain className="gap-1.5">
            <LanguageChips value={language} onChange={setLanguage} accent={accent} />
          </Field>
        </FormGroup>
      )}

      <FormGroup>
        <Field label={<>Reason for appointment <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why you went" className={`${ROW_TEXT_CLS} resize-none leading-relaxed`} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      <FormGroup title="Follow-up notes · optional">
        <MarkdownField value={followUpNotes} onChange={setFollowUpNotes} rows={4} required={false} placeholder="What was discussed, results, what to watch" />
      </FormGroup>

      <FormGroup title="Comments · optional">
        <MarkdownField value={notes} onChange={setNotes} rows={4} required={false} placeholder="Anything else worth noting" />
      </FormGroup>

      {!editing && (
        <FormGroup title="Follow-up tasks · optional">
          {tasks.map((task, index) => (
            <div key={index} className="flex flex-col">
              <div className="flex items-center gap-2 px-3.5">
                <input
                  value={task.description}
                  onChange={(e) => setTaskRow(index, { description: e.target.value })}
                  placeholder="e.g. Book the CT scan"
                  className={`${ROW_TEXT_CLS} min-h-11 flex-1`}
                  style={ROW_STYLE}
                />
                <button type="button" onClick={() => removeTaskRow(index)} aria-label="Remove task" className="tap-target shrink-0 rounded-md p-1.5 notebook-danger" style={{ color: "var(--text-muted)" }}>
                  <TrashIcon size={15} />
                </button>
              </div>
              <Field label="Due date" inline className="border-t" >
                <input type="date" value={task.dueDate} onChange={(e) => setTaskRow(index, { dueDate: e.target.value })} className={ROW_INLINE_CLS} style={ROW_STYLE} />
              </Field>
              <Field label="Reminder" inline className="border-t">
                <input type="datetime-local" value={task.reminderAt} onChange={(e) => setTaskRow(index, { reminderAt: e.target.value })} className={ROW_INLINE_CLS} style={ROW_STYLE} />
              </Field>
            </div>
          ))}
          <button type="button" onClick={addTaskRow} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: accent }}>
            Add follow-up task
          </button>
        </FormGroup>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" size="lg" accent={accent} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save appointment"}
        </Button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </FormShell>
  );
}
