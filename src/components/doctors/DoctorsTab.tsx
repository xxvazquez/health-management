"use client";

import { useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { Doctor } from "@/lib/supabase/doctors";
import { DoctorName, formatDate } from "./shared";
import { AppointmentList } from "./AppointmentList";
import { DetailPlaceholder, MedicalSplit, useIsDesktop } from "./MedicalSplit";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

type DoctorsApi = ReturnType<typeof useDoctors>;

/** Read-only view of one doctor — the name/rating/language/specialty are
 * all edited from Settings now (one place for everything editable); this
 * tab shows the doctor and their visit history. */
function DoctorHistory({ api, doctor, accent, onBack }: { api: DoctorsApi; doctor: Doctor; accent: string; onBack?: () => void }) {
  const { appointments, specialties } = api;
  const theirAppointments = appointments.data.filter((a) => a.doctorId === doctor.id);
  const nextAppt = specialties.data.find((s) => s.name.toLowerCase() === doctor.specialty.toLowerCase())?.nextAppointmentDate ?? null;

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button type="button" onClick={onBack} className="self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          ← All doctors
        </button>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-3" style={{ borderColor: "var(--gridline)" }}>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <DoctorName name={doctor.name} rating={doctor.rating} className="text-base" />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {[
              doctor.specialty || "No specialty",
              doctor.rating != null ? `rated ${doctor.rating}/3` : null,
              doctor.language,
              `next visit ${nextAppt ? formatDate(nextAppt) : "not set"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
        <Button href="/manage" variant="tinted" size="xs" accent={accent} className="shrink-0">
          Edit in Settings
        </Button>
      </div>

      <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        Appointments ({theirAppointments.length})
      </h3>
      <AppointmentList api={api} appointments={theirAppointments} accent={accent} showDoctor={false} emptyMessage={`No appointments with ${doctor.name} yet.`} />
    </div>
  );
}

export function DoctorsTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const { doctors, appointments } = api;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const desktop = useIsDesktop();

  if (doctors.data.length === 0) {
    return <InlineEmpty title="No doctors yet" description="Add one while logging an appointment — they're saved here for reuse." />;
  }

  // Desktop keeps a doctor open at all times so the detail pane is never
  // an empty placeholder; mobile stays list-first until one is tapped.
  const activeId = selectedId ?? (desktop ? doctors.data[0].id : null);
  const selected = doctors.data.find((d) => d.id === activeId) ?? null;

  const list = (
    <ul className="inset-rows flex flex-col rounded-xl border [--row-inset:1rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      {doctors.data.map((doctor) => {
        const count = appointments.data.filter((a) => a.doctorId === doctor.id).length;
        const active = doctor.id === activeId;
        return (
          <li key={doctor.id}>
            <button
              type="button"
              onClick={() => setSelectedId(active ? null : doctor.id)}
              aria-current={active ? "true" : undefined}
              className="flex min-h-11 w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-[var(--page-plane)]"
              style={{ borderLeftColor: active ? accent : "transparent", background: active ? "var(--page-plane)" : undefined }}
            >
              <span className="min-w-0 flex-1">
                <DoctorName name={doctor.name} rating={doctor.rating} className="text-sm" />
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {doctor.specialty}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {count} visit{count === 1 ? "" : "s"}
              </span>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true">
                <path d="M7.5 5 12.5 10 7.5 15" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <MedicalSplit
      selected={!!selected}
      list={list}
      detail={selected && <DoctorHistory api={api} doctor={selected} accent={accent} onBack={desktop ? undefined : () => setSelectedId(null)} />}
      placeholder={<DetailPlaceholder text="Pick a doctor to see their details and visit history." />}
    />
  );
}
