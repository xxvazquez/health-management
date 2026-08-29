"use client";

import { useMemo, useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { formatDate, NextAppointmentField } from "./shared";
import { AppointmentList } from "./AppointmentList";

type DoctorsApi = ReturnType<typeof useDoctors>;

function SpecialtyHistory({ api, name, accent, onBack }: { api: DoctorsApi; name: string; accent: string; onBack: () => void }) {
  const key = name.toLowerCase();
  const nextAppt = api.specialties.data.find((s) => s.name.toLowerCase() === key)?.nextAppointmentDate ?? null;
  const theirAppointments = api.appointments.data.filter((a) => a.specialty.toLowerCase() === key);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        ← All specialties
      </button>

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {name}
        </h2>
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
          <NextAppointmentField date={nextAppt} onChange={(date) => void api.specialties.setNextAppointment(name, date)} accent={accent} />
        </div>
      </div>

      <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        Appointments ({theirAppointments.length})
      </h3>
      <AppointmentList api={api} appointments={theirAppointments} accent={accent} emptyMessage={`No ${name} appointments logged yet.`} />
    </div>
  );
}

export function SpecialtiesTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const names = resolveSpecialtyNames(
      api.specialties.data,
      api.appointments.data.map((a) => a.specialty),
      api.doctors.data.map((d) => d.specialty),
    );
    return names.map((name) => {
      const key = name.toLowerCase();
      return {
        name,
        count: api.appointments.data.filter((a) => a.specialty.toLowerCase() === key).length,
        nextAppointmentDate: api.specialties.data.find((s) => s.name.toLowerCase() === key)?.nextAppointmentDate ?? null,
      };
    });
  }, [api.specialties.data, api.appointments.data, api.doctors.data]);

  if (selected) return <SpecialtyHistory api={api} name={selected} accent={accent} onBack={() => setSelected(null)} />;

  // Specialties with history or a next-appointment date first, then the rest.
  const withActivity = rows.filter((r) => r.count > 0 || r.nextAppointmentDate);
  const rest = rows.filter((r) => r.count === 0 && !r.nextAppointmentDate);

  return (
    <div className="flex flex-col gap-4">
      {withActivity.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          {withActivity.map((row) => (
            <li key={row.name} style={{ borderColor: "var(--gridline)" }}>
              <button type="button" onClick={() => setSelected(row.name)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--page-plane)]">
                <span className="min-w-0">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {row.name}
                  </span>
                  {row.nextAppointmentDate && (
                    <span className="ml-2 text-xs" style={{ color: accent }}>
                      next {formatDate(row.nextAppointmentDate)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {row.count} visit{row.count === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          All specialties ({rest.length})
        </summary>
        <ul className="flex flex-col divide-y border-t" style={{ borderColor: "var(--gridline)" }}>
          {rest.map((row) => (
            <li key={row.name} style={{ borderColor: "var(--gridline)" }}>
              <button type="button" onClick={() => setSelected(row.name)} className="flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--page-plane)]" style={{ color: "var(--text-primary)" }}>
                {row.name}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
