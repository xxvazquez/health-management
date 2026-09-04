"use client";

import { useMemo, useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";
import { formatDate, NextAppointmentField } from "./shared";
import { AppointmentList } from "./AppointmentList";
import { DetailPlaceholder, MedicalSplit, useIsDesktop } from "./MedicalSplit";

type DoctorsApi = ReturnType<typeof useDoctors>;

function SpecialtyHistory({ api, name, accent, onBack }: { api: DoctorsApi; name: string; accent: string; onBack?: () => void }) {
  const key = name.toLowerCase();
  const specialty = api.specialties.data.find((s) => s.name.toLowerCase() === key);
  const nextAppt = specialty?.nextAppointmentDate ?? null;
  const theirAppointments = api.appointments.data.filter((a) => a.specialty.toLowerCase() === key);
  const theirEntries = specialty ? api.careLog.data.filter((e) => e.specialtyIds.includes(specialty.id)) : [];
  const rowAccent = (specialty && customColorValue(specialty.color)) ?? accent;

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button type="button" onClick={onBack} className="self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          ← All specialties
        </button>
      )}

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}>
        <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {specialty?.icon && (
            <span style={{ color: rowAccent }}>
              <CustomIcon icon={specialty.icon} size={16} />
            </span>
          )}
          {name}
        </h2>
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
          <NextAppointmentField date={nextAppt} onChange={(date) => void api.specialties.setNextAppointment(name, date)} accent={accent} />
        </div>
      </div>

      {theirEntries.length > 0 && (
        <>
          <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            To raise here ({theirEntries.length})
          </h3>
          <ul className="flex flex-col divide-y rounded-xl border px-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {theirEntries.map((e) => (
              <li key={e.id} className="py-2.5">
                <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatDate(e.happenedOn)}
                </span>
                <span className="mt-0.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {e.title}
                </span>
                {e.body && (
                  <span className="mt-0.5 block text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
                    {e.body}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        Appointments ({theirAppointments.length})
      </h3>
      <AppointmentList api={api} appointments={theirAppointments} accent={accent} emptyMessage={`No ${name} appointments logged yet.`} />
    </div>
  );
}

export function SpecialtiesTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const desktop = useIsDesktop();

  const rows = useMemo(() => {
    const names = resolveSpecialtyNames(
      api.specialties.data,
      api.appointments.data.map((a) => a.specialty),
      api.doctors.data.map((d) => d.specialty),
    );
    return names.map((name) => {
      const key = name.toLowerCase();
      const specialty = api.specialties.data.find((s) => s.name.toLowerCase() === key);
      return {
        name,
        count: api.appointments.data.filter((a) => a.specialty.toLowerCase() === key).length,
        entryCount: specialty ? api.careLog.data.filter((e) => e.specialtyIds.includes(specialty.id)).length : 0,
        nextAppointmentDate: specialty?.nextAppointmentDate ?? null,
        icon: specialty?.icon ?? null,
        color: specialty?.color ?? null,
      };
    });
  }, [api.specialties.data, api.appointments.data, api.doctors.data, api.careLog.data]);

  // Specialties with history, log entries, or a next-appointment date first,
  // then the rest.
  const withActivity = rows.filter((r) => r.count > 0 || r.entryCount > 0 || r.nextAppointmentDate);
  const rest = rows.filter((r) => r.count === 0 && r.entryCount === 0 && !r.nextAppointmentDate);

  const list = (
    <div className="flex flex-col gap-4">
      {withActivity.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          {withActivity.map((row) => {
            const active = row.name === selected;
            return (
              <li key={row.name} style={{ borderColor: "var(--gridline)" }}>
                <button
                  type="button"
                  onClick={() => setSelected(row.name)}
                  aria-current={active ? "true" : undefined}
                  className="flex w-full items-center justify-between gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-[var(--page-plane)]"
                  style={{ borderLeftColor: active ? accent : "transparent", background: active ? "var(--page-plane)" : undefined }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {row.icon && (
                      <span className="shrink-0" style={{ color: customColorValue(row.color) ?? accent }}>
                        <CustomIcon icon={row.icon} size={14} />
                      </span>
                    )}
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
                    {row.count > 0 && `${row.count} visit${row.count === 1 ? "" : "s"}`}
                    {row.count > 0 && row.entryCount > 0 && " · "}
                    {row.entryCount > 0 && `${row.entryCount} to raise`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          All specialties ({rest.length})
        </summary>
        <ul className="flex flex-col divide-y border-t" style={{ borderColor: "var(--gridline)" }}>
          {rest.map((row) => {
            const active = row.name === selected;
            return (
              <li key={row.name} style={{ borderColor: "var(--gridline)" }}>
                <button
                  type="button"
                  onClick={() => setSelected(row.name)}
                  aria-current={active ? "true" : undefined}
                  className="flex w-full items-center gap-1.5 border-l-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--page-plane)]"
                  style={{ color: "var(--text-primary)", borderLeftColor: active ? accent : "transparent", background: active ? "var(--page-plane)" : undefined }}
                >
                  {row.icon && (
                    <span className="shrink-0" style={{ color: customColorValue(row.color) ?? accent }}>
                      <CustomIcon icon={row.icon} size={14} />
                    </span>
                  )}
                  {row.name}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );

  return (
    <MedicalSplit
      selected={selected != null}
      list={list}
      detail={selected != null ? <SpecialtyHistory api={api} name={selected} accent={accent} onBack={desktop ? undefined : () => setSelected(null)} /> : null}
      placeholder={<DetailPlaceholder text="Pick a specialty to see its next appointment, points to raise, and visit history." />}
    />
  );
}
