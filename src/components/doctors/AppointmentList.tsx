"use client";

import { useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { DoctorAppointment } from "@/lib/supabase/doctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { AppointmentCard } from "./AppointmentCard";
import { AppointmentForm } from "./AppointmentForm";

type DoctorsApi = ReturnType<typeof useDoctors>;

/** A history list of appointment cards with a shared inline edit form —
 * used by the Appointments tab and by both history views. */
export function AppointmentList({
  api,
  appointments,
  accent,
  showDoctor = true,
  emptyMessage,
}: {
  api: DoctorsApi;
  appointments: DoctorAppointment[];
  accent: string;
  showDoctor?: boolean;
  emptyMessage: string;
}) {
  const [editing, setEditing] = useState<DoctorAppointment | null>(null);

  const specialtyOptions = resolveSpecialtyNames(
    api.specialties.data,
    api.appointments.data.map((a) => a.specialty),
    api.doctors.data.map((d) => d.specialty),
  );

  if (editing) {
    return (
      <AppointmentForm
        accent={accent}
        doctors={api.doctors.data}
        specialtyOptions={specialtyOptions}
        initial={editing}
        initialDoctor={api.doctors.data.find((d) => d.id === editing.doctorId)}
        onCreate={async () => undefined}
        onEdit={async (id, patch) => {
          await api.appointments.edit(id, patch);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (appointments.length === 0) {
    return (
      <p className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {appointments.map((appt) => (
        <AppointmentCard
          key={appt.id}
          appointment={appt}
          doctor={api.doctors.data.find((d) => d.id === appt.doctorId)}
          tasks={api.tasks.data.filter((t) => t.appointmentId === appt.id)}
          accent={accent}
          showDoctor={showDoctor}
          onEdit={() => setEditing(appt)}
          onDelete={() => void api.appointments.remove(appt.id)}
          onAddTask={(input) => void api.tasks.add(appt.id, input)}
          onEditTask={(id, patch) => void api.tasks.edit(id, patch)}
          onToggleTask={(id, done) => void api.tasks.setComplete(id, done)}
          onDeleteTask={(id) => void api.tasks.remove(id)}
        />
      ))}
    </div>
  );
}
