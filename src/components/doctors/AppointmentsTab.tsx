"use client";

import { useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { AppointmentForm } from "./AppointmentForm";
import { AppointmentList } from "./AppointmentList";
import { PrimaryAction } from "@/components/ui/PrimaryAction";

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
        <PrimaryAction label="Log appointment" accent={accent} onClick={() => setComposing(true)} />
      </div>
      <AppointmentList api={api} appointments={appointments.data} accent={accent} emptyMessage="No appointments logged yet — tap Log appointment to record a visit you've already had." />
    </div>
  );
}
