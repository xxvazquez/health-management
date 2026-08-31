"use client";

import { useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { Doctor } from "@/lib/supabase/doctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { ComboBox, DoctorName, FIELD_CLS, FIELD_STYLE, LanguageChips, NextAppointmentField, PencilIcon, RatingChips } from "./shared";
import { AppointmentList } from "./AppointmentList";
import { InlineEmpty } from "@/components/ui/EmptyState";

type DoctorsApi = ReturnType<typeof useDoctors>;

function DoctorHistory({ api, doctor, accent, onBack }: { api: DoctorsApi; doctor: Doctor; accent: string; onBack: () => void }) {
  const { appointments, specialties, doctors } = api;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [nameDraft, setNameDraft] = useState(doctor.name);
  const [specialtyDraft, setSpecialtyDraft] = useState(doctor.specialty);

  const theirAppointments = appointments.data.filter((a) => a.doctorId === doctor.id);
  const nextAppt = specialties.data.find((s) => s.name.toLowerCase() === doctor.specialty.toLowerCase())?.nextAppointmentDate ?? null;
  const specialtyOptions = resolveSpecialtyNames(
    specialties.data,
    appointments.data.map((a) => a.specialty),
    doctors.data.map((d) => d.specialty),
  );

  function saveDetails() {
    const name = nameDraft.trim();
    const specialty = specialtyDraft.trim();
    if (name && (name !== doctor.name || specialty !== doctor.specialty)) {
      void doctors.edit(doctor.id, { name, specialty: specialty || doctor.specialty });
      if (specialty && specialty.toLowerCase() !== doctor.specialty.toLowerCase()) void specialties.ensure([specialty]);
    }
    setEditingDetails(false);
  }

  async function handleDelete() {
    try {
      await doctors.remove(doctor.id);
      onBack();
    } catch {
      setDeleteError("This doctor has appointments — delete those first.");
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        ← All doctors
      </button>

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}>
        {editingDetails ? (
          <div className="flex flex-col gap-2">
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} aria-label="Doctor name" className={FIELD_CLS} style={FIELD_STYLE} />
            <ComboBox value={specialtyDraft} onChange={setSpecialtyDraft} options={specialtyOptions} placeholder="Specialty" accent={accent} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveDetails} className="rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: accent }}>
                Save
              </button>
              <button type="button" onClick={() => setEditingDetails(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="flex items-center gap-1.5">
                <DoctorName name={doctor.name} rating={doctor.rating} className="text-base" />
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(doctor.name);
                    setSpecialtyDraft(doctor.specialty);
                    setEditingDetails(true);
                  }}
                  aria-label="Edit name and specialty"
                  className="tap-target rounded-md p-1 transition-colors hover:bg-[var(--page-plane)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <PencilIcon size={13} />
                </button>
              </span>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {doctor.specialty}
              </p>
            </div>
            {theirAppointments.length === 0 && !confirmDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-medium notebook-danger rounded-md px-2 py-1" style={{ color: "var(--text-muted)" }}>
                Delete doctor
              </button>
            )}
          </div>
        )}

        {confirmDelete && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Delete {doctor.name}?</span>
            <button type="button" onClick={handleDelete} className="rounded-md px-2 py-1 font-semibold" style={{ color: "var(--status-critical)" }}>
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 font-medium" style={{ color: "var(--text-muted)" }}>
              Keep
            </button>
          </div>
        )}
        {deleteError && (
          <p className="mt-2 text-xs" style={{ color: "var(--status-warning)" }}>
            {deleteError}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Rating
            </span>
            <RatingChips value={doctor.rating} onChange={(rating) => void doctors.edit(doctor.id, { rating })} accent={accent} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Language
            </span>
            <LanguageChips value={doctor.language} onChange={(language) => void doctors.edit(doctor.id, { language })} accent={accent} />
          </div>
          <NextAppointmentField date={nextAppt} onChange={(date) => void specialties.setNextAppointment(doctor.specialty, date)} accent={accent} />
        </div>
      </div>

      <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        Appointments ({theirAppointments.length})
      </h3>
      <AppointmentList api={api} appointments={theirAppointments} accent={accent} showDoctor={false} emptyMessage={`No appointments with ${doctor.name} yet.`} />
    </div>
  );
}

export function DoctorsTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { doctors, appointments } = api;

  const selected = selectedId ? doctors.data.find((d) => d.id === selectedId) : null;
  if (selected) return <DoctorHistory api={api} doctor={selected} accent={accent} onBack={() => setSelectedId(null)} />;

  if (doctors.data.length === 0) {
    return <InlineEmpty title="No doctors yet" description="Add one while logging an appointment — they're saved here for reuse." />;
  }

  return (
    <ul className="flex flex-col divide-y rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      {doctors.data.map((doctor) => {
        const count = appointments.data.filter((a) => a.doctorId === doctor.id).length;
        return (
          <li key={doctor.id} style={{ borderColor: "var(--gridline)" }}>
            <button type="button" onClick={() => setSelectedId(doctor.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--page-plane)]">
              <span className="min-w-0">
                <DoctorName name={doctor.name} rating={doctor.rating} className="text-sm" />
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {doctor.specialty}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {count} visit{count === 1 ? "" : "s"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
