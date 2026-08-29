"use client";

import { useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { AppointmentForm } from "./AppointmentForm";
import { AppointmentList } from "./AppointmentList";

type DoctorsApi = ReturnType<typeof useDoctors>;

export function AppointmentsTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [composing, setComposing] = useState(false);
  const { doctors, appointments, specialties } = api;

  const specialtyOptions = resolveSpecialtyNames(
    specialties.data,
    appointments.data.map((a) => a.specialty),
    doctors.data.map((d) => d.specialty),
  );

  if (composing) {
    return (
      <AppointmentForm
        accent={accent}
        doctors={doctors.data}
        specialtyOptions={specialtyOptions}
        onCreate={async (input) => {
          await appointments.log(input);
          setComposing(false);
        }}
        onEdit={async () => undefined}
        onCancel={() => setComposing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setComposing(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }}>
          + Log appointment
        </button>
      </div>
      <AppointmentList api={api} appointments={appointments.data} accent={accent} emptyMessage="No appointments logged yet — tap + Log appointment to record a visit you've already had." />
    </div>
  );
}
