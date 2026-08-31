"use client";

import { useState, type FormEvent } from "react";
import type { Doctor, DoctorAppointment } from "@/lib/supabase/doctors";
import type { DoctorLanguage } from "@/lib/doctors";
import type { LogAppointmentInput } from "@/lib/useDoctors";
import { ComboBox, DoctorName, FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE, LanguageChips, RatingChips, TrashIcon, toLocalInput } from "./shared";

interface TaskDraft {
  description: string;
  dueDate: string;
  reminderAt: string;
}

function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
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
  onEdit: (id: string, patch: { appointmentAt: string; reason: string; followUpNotes: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = initial != null;

  const [doctorName, setDoctorName] = useState(initialDoctor?.name ?? "");
  const [specialty, setSpecialty] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [language, setLanguage] = useState<DoctorLanguage | null>(null);

  const [appointmentAt, setAppointmentAt] = useState(initial ? toLocalInput(initial.appointmentAt) : nowLocalInput());
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [followUpNotes, setFollowUpNotes] = useState(initial?.followUpNotes ?? "");
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
    if (!appointmentAt) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await onEdit(initial.id, { appointmentAt: new Date(appointmentAt).toISOString(), reason, followUpNotes });
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
          newDoctor: isNewDoctor ? { name: doctorName.trim(), specialty: specialty.trim(), rating, language } : null,
          appointmentAt: new Date(appointmentAt).toISOString(),
          reason,
          followUpNotes,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {editing ? "Edit appointment" : "Log appointment"}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLS} style={LABEL_STYLE}>
          Doctor
        </label>
        {editing ? (
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            <DoctorName name={initialDoctor?.name ?? "—"} rating={initialDoctor?.rating ?? null} /> · {initial.specialty}
          </span>
        ) : (
          <ComboBox
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
      </div>

      {isNewDoctor && (
        <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "var(--gridline)", background: "var(--page-backdrop)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            New doctor — saved for reuse.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLS} style={LABEL_STYLE}>
              Specialty
            </label>
            <ComboBox value={specialty} onChange={setSpecialty} options={specialtyOptions} placeholder="Search or add a specialty…" accent={accent} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLS} style={LABEL_STYLE}>
              Rating <span style={{ color: "var(--text-muted)" }}>· optional</span>
            </label>
            <RatingChips value={rating} onChange={setRating} accent={accent} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLS} style={LABEL_STYLE}>
              Language <span style={{ color: "var(--text-muted)" }}>· optional</span>
            </label>
            <LanguageChips value={language} onChange={setLanguage} accent={accent} />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLS} style={LABEL_STYLE}>
            Date &amp; time
          </label>
          <input type="datetime-local" required value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLS} style={LABEL_STYLE}>
          Reason for appointment <span style={{ color: "var(--text-muted)" }}>· optional</span>
        </label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why you went" className={`${FIELD_CLS} resize-y leading-relaxed`} style={FIELD_STYLE} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLS} style={LABEL_STYLE}>
          Follow-up notes <span style={{ color: "var(--text-muted)" }}>· optional</span>
        </label>
        <textarea
          value={followUpNotes}
          onChange={(e) => setFollowUpNotes(e.target.value)}
          rows={3}
          placeholder="What was discussed, results, what to watch"
          className={`${FIELD_CLS} resize-y leading-relaxed`}
          style={FIELD_STYLE}
        />
      </div>

      {!editing && (
        <div className="flex flex-col gap-2">
          <label className={LABEL_CLS} style={LABEL_STYLE}>
            Follow-up tasks <span style={{ color: "var(--text-muted)" }}>· optional</span>
          </label>
          {tasks.map((task, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--gridline)" }}>
              <div className="flex items-center gap-2">
                <input
                  value={task.description}
                  onChange={(e) => setTaskRow(index, { description: e.target.value })}
                  placeholder="e.g. Book the CT scan"
                  className={`${FIELD_CLS} flex-1`}
                  style={FIELD_STYLE}
                />
                <button type="button" onClick={() => removeTaskRow(index)} aria-label="Remove task" className="tap-target shrink-0 rounded-md p-1.5 notebook-danger" style={{ color: "var(--text-muted)" }}>
                  <TrashIcon size={15} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs" style={LABEL_STYLE}>
                  Due date · optional
                  <input type="date" value={task.dueDate} onChange={(e) => setTaskRow(index, { dueDate: e.target.value })} className={FIELD_CLS} style={FIELD_STYLE} />
                </label>
                <label className="flex flex-col gap-1 text-xs" style={LABEL_STYLE}>
                  Reminder · optional
                  <input type="datetime-local" value={task.reminderAt} onChange={(e) => setTaskRow(index, { reminderAt: e.target.value })} className={FIELD_CLS} style={FIELD_STYLE} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={addTaskRow} className="self-start text-xs font-medium underline decoration-dotted" style={{ color: accent }}>
            + Add follow-up task
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save appointment"}
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
