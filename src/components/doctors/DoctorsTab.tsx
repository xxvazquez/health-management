"use client";

import { useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { Doctor } from "@/lib/supabase/doctors";
import { DoctorName, formatDate } from "./shared";
import { AppointmentList } from "./AppointmentList";
import { DetailPlaceholder, MedicalSplit, useIsDesktop } from "./MedicalSplit";
import { InlineEmpty } from "@/components/ui/EmptyState";
import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";
import { settingsHref } from "@/components/manage/ManageSection";

type DoctorsApi = ReturnType<typeof useDoctors>;

/** Read-only view of one doctor — the name/rating/language/specialty are
 * all edited from Settings (one place for everything editable), which the
 * Edit link opens; this tab shows the doctor, their notes and visits. */
function DoctorHistory({ api, doctor, accent, onBack }: { api: DoctorsApi; doctor: Doctor; accent: string; onBack?: () => void }) {
  const { appointments, specialties } = api;
  const theirAppointments = appointments.data.filter((a) => a.doctorId === doctor.id);
  const nextAppt = specialties.data.find((s) => s.name.toLowerCase() === doctor.specialty.toLowerCase())?.nextAppointmentDate ?? null;

  const editLink = (
    <Link href={settingsHref("Doctors", doctor.id)} className="hit-slop text-sm font-medium" style={{ color: accent }}>
      Edit
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="-ml-1 flex min-h-11 items-center gap-0.5 text-sm font-medium" style={{ color: accent }}>
            <ChevronIcon dir="left" size={16} />
            Doctors
          </button>
          {editLink}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-baseline justify-between gap-3 text-base font-semibold">
          <DoctorName name={doctor.name} rating={doctor.rating} weight="font-semibold" />
          {!onBack && editLink}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {[doctor.specialty || "No specialty", doctor.rating != null ? `rated ${doctor.rating}/3` : null, doctor.language]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {nextAppt && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Next visit {formatDate(nextAppt)}
          </p>
        )}
      </div>

      <Link
        href={`/medical/summary/?doctor=${doctor.id}`}
        className="flex min-h-11 items-center gap-3 rounded-xl border px-3.5 text-sm"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      >
        Visit summary
        <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
          Print or PDF
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <ChevronIcon dir="right" size={14} />
        </span>
      </Link>

      {doctor.notes && (
        <section className="flex flex-col gap-1.5">
          <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Notes
          </h3>
          <p
            className="rounded-xl border px-3.5 py-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          >
            {doctor.notes}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Appointments
        </h3>
        <AppointmentList api={api} appointments={theirAppointments} accent={accent} showDoctor={false} emptyMessage={`No appointments with ${doctor.name} yet.`} />
      </section>
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
