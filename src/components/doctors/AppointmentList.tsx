"use client";

import { useId, useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { DoctorAppointment } from "@/lib/supabase/doctors";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { AppointmentCard } from "./AppointmentCard";
import { AppointmentForm } from "./AppointmentForm";
import { Sheet } from "@/components/ui/Sheet";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { DoctorName, formatDate, formatShortDate } from "./shared";
import { useUndoableTick } from "@/lib/useUndoableTick";

type DoctorsApi = ReturnType<typeof useDoctors>;

/** A history list of appointments as grouped rows — doctor, date, reason
 * and any open follow-ups (tickable in place). Tapping a row opens the
 * visit's full card in a sheet, where it's edited or deleted. Used by
 * Visits and by the doctor history view. */
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
  const [openId, setOpenId] = useState<string | null>(null);
  const sheetTitleId = useId();
  const open = openId ? (appointments.find((a) => a.id === openId) ?? null) : null;

  const specialtyOptions = resolveSpecialtyNames(
    api.specialties.data,
    api.appointments.data.map((a) => a.specialty),
    api.doctors.data.map((d) => d.specialty),
  );

  const editSheet = editing ? (
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
  ) : null;

  if (appointments.length === 0) {
    return (
      <p className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyMessage}
      </p>
    );
  }

  const openDoctor = open ? api.doctors.data.find((d) => d.id === open.doctorId) : undefined;

  return (
    <>
      {open && (
        <Sheet
          title={openDoctor?.name ?? "Unknown doctor"}
          subtitle={
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatDate(open.appointmentAt)} · {open.specialty}
            </span>
          }
          titleId={sheetTitleId}
          onClose={() => setOpenId(null)}
          actions={
            <button type="button" onClick={() => setEditing(open)} className="hit-slop text-sm font-medium" style={{ color: accent }}>
              Edit
            </button>
          }
        >
          <AppointmentCard
            appointment={open}
            tasks={api.tasks.data.filter((t) => t.appointmentId === open.id)}
            accent={accent}
            onDelete={() => {
              setOpenId(null);
              void api.appointments.remove(open.id);
            }}
            onAddTask={(input) => void api.tasks.add(open.id, input)}
            onEditTask={(id, patch) => void api.tasks.edit(id, patch)}
            onToggleTask={(id, done) => void api.tasks.setComplete(id, done)}
            onDeleteTask={(id) => void api.tasks.remove(id)}
          />
        </Sheet>
      )}
      {editSheet}
      <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {appointments.map((appt) => {
          const doctor = api.doctors.data.find((d) => d.id === appt.doctorId);
          const tasks = api.tasks.data.filter((t) => t.appointmentId === appt.id);
          const openTasks = tasks.filter((t) => !t.completedAt);
          const doneCount = tasks.length - openTasks.length;
          return (
            <li key={appt.id} className="flex flex-col px-3.5 py-2.5">
              <button type="button" onClick={() => setOpenId(appt.id)} className="flex min-h-9 w-full flex-col gap-0.5 text-left">
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm">
                    {showDoctor ? (
                      <>
                        <DoctorName name={doctor?.name ?? "Unknown doctor"} rating={doctor?.rating ?? null} />
                        <span style={{ color: "var(--text-muted)" }}> · {appt.specialty}</span>
                      </>
                    ) : (
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {appt.reason || appt.specialty}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatShortDate(appt.appointmentAt)}
                  </span>
                </span>
                {((showDoctor && appt.reason) || (openTasks.length === 0 && doneCount > 0)) && (
                  <span className="line-clamp-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {showDoctor && appt.reason}
                    {openTasks.length === 0 && doneCount > 0 && (
                      <span style={{ color: "var(--text-muted)" }}>
                        {showDoctor && appt.reason ? " · " : ""}
                        {doneCount} follow-up{doneCount === 1 ? "" : "s"} done
                      </span>
                    )}
                  </span>
                )}
              </button>
              {openTasks.map((task) => (
                <div key={task.id} className="flex min-h-9 items-center gap-2.5">
                  <FollowUpTick label={task.description} onComplete={() => void api.tasks.setComplete(task.id, true)} />
                  <button type="button" onClick={() => setOpenId(appt.id)} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-left">
                    <span className="min-w-0 text-sm" style={{ color: "var(--text-primary)" }}>
                      {task.description}
                    </span>
                    {task.dueDate && (
                      <span className="shrink-0 text-xs tabular-nums" style={{ color: task.dueDate < todayLocalISODate() ? "var(--status-critical)" : "var(--text-muted)" }}>
                        Due {formatShortDate(task.dueDate)}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A follow-up's done circle: fills in and waits a moment (tap again to
 * undo) before the task leaves the list. */
function FollowUpTick({ label, onComplete }: { label: string; onComplete: () => void }) {
  const { ticked, toggle } = useUndoableTick(onComplete);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={ticked ? `Mark "${label}" not done` : `Mark "${label}" done`}
      aria-pressed={ticked}
      className="tap-target flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors hover:border-[var(--status-good)]"
      style={{ borderColor: ticked ? "var(--status-good)" : "var(--text-secondary)", background: ticked ? "var(--status-good)" : "transparent" }}
    >
      {ticked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--surface-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 6.5 5 9l4.5-5" />
        </svg>
      )}
    </button>
  );
}
