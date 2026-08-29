"use client";

import { useMemo } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { DoctorName } from "./shared";
import { FollowUpTaskRow } from "./FollowUpTaskRow";

type DoctorsApi = ReturnType<typeof useDoctors>;

export function FollowUpsTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const { tasks, appointments, doctors } = api;

  const context = useMemo(() => {
    const apptById = new Map(appointments.data.map((a) => [a.id, a]));
    const doctorById = new Map(doctors.data.map((d) => [d.id, d]));
    return (appointmentId: string) => {
      const appt = apptById.get(appointmentId);
      const doctor = appt ? doctorById.get(appt.doctorId) : undefined;
      return { doctorName: doctor?.name ?? "Unknown doctor", rating: doctor?.rating ?? null, specialty: appt?.specialty ?? "" };
    };
  }, [appointments.data, doctors.data]);

  const { open, done } = useMemo(() => {
    const sorted = [...tasks.data].sort((a, b) => {
      const ad = a.dueDate ?? "9999-12-31";
      const bd = b.dueDate ?? "9999-12-31";
      return ad.localeCompare(bd);
    });
    return {
      open: sorted.filter((t) => !t.completedAt),
      done: sorted.filter((t) => t.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [tasks.data]);

  const rowContext = (appointmentId: string) => {
    const c = context(appointmentId);
    return (
      <>
        <DoctorName name={c.doctorName} rating={c.rating} weight="font-normal" className="text-xs" />
        {c.specialty && <span> · {c.specialty}</span>}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <div className="border-b px-4 py-2" style={{ borderColor: "var(--border-hairline)" }}>
          <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Outstanding ({open.length})
          </h3>
        </div>
        <div className="px-4">
          {open.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing outstanding.
            </p>
          ) : (
            open.map((task) => (
              <FollowUpTaskRow
                key={task.id}
                task={task}
                accent={accent}
                context={rowContext(task.appointmentId)}
                onToggle={(d) => void tasks.setComplete(task.id, d)}
                onEdit={(patch) => void tasks.edit(task.id, patch)}
                onDelete={() => void tasks.remove(task.id)}
              />
            ))
          )}
        </div>
      </section>

      {done.length > 0 && (
        <details className="rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Completed ({done.length})
          </summary>
          <div className="border-t px-4" style={{ borderColor: "var(--gridline)" }}>
            {done.map((task) => (
              <FollowUpTaskRow
                key={task.id}
                task={task}
                accent={accent}
                context={rowContext(task.appointmentId)}
                onToggle={(d) => void tasks.setComplete(task.id, d)}
                onEdit={(patch) => void tasks.edit(task.id, patch)}
                onDelete={() => void tasks.remove(task.id)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
