"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  createDoctor,
  createDoctorAppointment,
  createDoctorFollowUpTask,
  createDoctorSpecialty,
  deleteDoctor,
  deleteDoctorAppointment,
  deleteDoctorFollowUpTask,
  deleteDoctorSpecialty,
  ensureDoctorSpecialties,
  fetchDoctorAppointments,
  fetchDoctorFollowUpTasks,
  fetchDoctorSpecialties,
  fetchDoctors,
  renameDoctorSpecialty,
  setDoctorFollowUpTaskComplete,
  setDoctorSpecialtyArchived,
  setSpecialtyNextAppointment,
  updateDoctor,
  updateDoctorAppointment,
  updateDoctorFollowUpTask,
  type AppointmentPatch,
  type Doctor,
  type DoctorAppointment,
  type DoctorFollowUpTask,
  type DoctorPatch,
  type DoctorSpecialty,
  type FollowUpTaskPatch,
  type NewDoctorInput,
  type NewFollowUpTaskInput,
} from "@/lib/supabase/doctors";
import { buildDemoDoctorAppointments, buildDemoDoctorFollowUpTasks, buildDemoDoctorSpecialties, buildDemoDoctors } from "@/lib/demoDoctors";
import { useCareLog } from "@/lib/useCareLog";

/** Survives navigation away from Doctors and back so returning doesn't
 * re-flash "Loading…" — same cross-nav cache pattern as
 * usePersonalReminderBoards. Keyed by user id; cleared on sign-out. */
let cache: { userId: string; specialties: DoctorSpecialty[]; doctors: Doctor[]; appointments: DoctorAppointment[]; tasks: DoctorFollowUpTask[] } | null = null;

export interface LogAppointmentInput {
  /** Exactly one of these is set. */
  doctorId: string | null;
  newDoctor: NewDoctorInput | null;
  appointmentAt: string;
  reason: string;
  followUpNotes: string;
  tasks: NewFollowUpTaskInput[];
}

function demoId(prefix: string): string {
  return `demo-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** All state + handlers behind the Doctors page — the direct-to-Supabase
 * counterpart to usePersonalReminderBoards. Signed out shows interactive
 * example data held only in local state. */
export function useDoctors() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [specialties, setSpecialties] = useState<DoctorSpecialty[]>(() => seed?.specialties ?? buildDemoDoctorSpecialties());
  const [doctors, setDoctors] = useState<Doctor[]>(() => seed?.doctors ?? buildDemoDoctors());
  const [appointments, setAppointments] = useState<DoctorAppointment[]>(() => seed?.appointments ?? buildDemoDoctorAppointments());
  const [tasks, setTasks] = useState<DoctorFollowUpTask[]>(() => seed?.tasks ?? buildDemoDoctorFollowUpTasks());
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const careLog = useCareLog();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [s, d, a, t] = await Promise.all([
        fetchDoctorSpecialties(),
        fetchDoctors(),
        fetchDoctorAppointments(),
        fetchDoctorFollowUpTasks(),
      ]);
      setSpecialties(s);
      setDoctors(d);
      setAppointments(a);
      setTasks(t);
    } catch (err) {
      console.error("useDoctors load failed", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) cache = { userId, specialties, doctors, appointments, tasks };
  }, [userId, isDemo, loading, specialties, doctors, appointments, tasks]);

  useEffect(() => {
    if (authLoading || isDemo) return;
    // External read on mount, not a state-sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [authLoading, isDemo, userId, load]);

  // --- Specialties ---
  const ensureSpecialties = useCallback(
    async (names: string[] = []) => {
      if (isDemo) return;
      try {
        setSpecialties(await ensureDoctorSpecialties(names));
      } catch (err) {
        console.error("ensureDoctorSpecialties failed", err);
      }
    },
    [isDemo],
  );

  const createSpecialty = useCallback(
    async (name: string) => {
      if (isDemo) {
        setSpecialties((prev) => [...prev, { id: demoId("spec"), name: name.trim(), nextAppointmentDate: null, isArchived: false }].sort((a, b) => a.name.localeCompare(b.name)));
        return;
      }
      const created = await createDoctorSpecialty(name);
      setSpecialties((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    },
    [isDemo],
  );

  const renameSpecialty = useCallback(
    async (id: string, name: string) => {
      setSpecialties((prev) => prev.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)).sort((a, b) => a.name.localeCompare(b.name)));
      if (!isDemo) await renameDoctorSpecialty(id, name).catch((err) => console.error("renameDoctorSpecialty failed", err));
    },
    [isDemo],
  );

  const archiveSpecialty = useCallback(
    async (id: string, archived: boolean) => {
      setSpecialties((prev) => prev.map((s) => (s.id === id ? { ...s, isArchived: archived } : s)));
      if (!isDemo) await setDoctorSpecialtyArchived(id, archived).catch((err) => console.error("setDoctorSpecialtyArchived failed", err));
    },
    [isDemo],
  );

  const removeSpecialty = useCallback(
    async (id: string) => {
      setSpecialties((prev) => prev.filter((s) => s.id !== id));
      if (!isDemo) await deleteDoctorSpecialty(id).catch((err) => console.error("deleteDoctorSpecialty failed", err));
    },
    [isDemo],
  );

  const setNextAppointment = useCallback(
    async (specialtyName: string, date: string | null) => {
      if (isDemo) {
        setSpecialties((prev) => {
          const key = specialtyName.trim().toLowerCase();
          if (prev.some((s) => s.name.toLowerCase() === key)) {
            return prev.map((s) => (s.name.toLowerCase() === key ? { ...s, nextAppointmentDate: date } : s));
          }
          return [...prev, { id: demoId("spec"), name: specialtyName.trim(), nextAppointmentDate: date, isArchived: false }].sort((a, b) => a.name.localeCompare(b.name));
        });
        return;
      }
      setSpecialties(await setSpecialtyNextAppointment(specialtyName, date));
    },
    [isDemo],
  );

  // --- Doctors ---
  const editDoctor = useCallback(
    async (id: string, patch: DoctorPatch) => {
      setDoctors((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)).sort((a, b) => a.name.localeCompare(b.name)));
      if (!isDemo) {
        const updated = await updateDoctor(id, patch);
        setDoctors((prev) => prev.map((d) => (d.id === id ? updated : d)).sort((a, b) => a.name.localeCompare(b.name)));
      }
    },
    [isDemo],
  );

  const removeDoctor = useCallback(
    async (id: string) => {
      if (isDemo) {
        setDoctors((prev) => prev.filter((d) => d.id !== id));
        return;
      }
      await deleteDoctor(id);
      setDoctors((prev) => prev.filter((d) => d.id !== id));
    },
    [isDemo],
  );

  // --- Appointments ---
  const logAppointment = useCallback(
    async (input: LogAppointmentInput) => {
      if (isDemo) {
        let doctorId = input.doctorId;
        let specialty = doctors.find((d) => d.id === doctorId)?.specialty ?? "";
        if (input.newDoctor) {
          doctorId = demoId("doctor");
          specialty = input.newDoctor.specialty.trim();
          const newDoc: Doctor = {
            id: doctorId,
            name: input.newDoctor.name.trim(),
            specialty,
            rating: input.newDoctor.rating,
            language: input.newDoctor.language,
            createdAt: new Date().toISOString(),
          };
          setDoctors((prev) => [...prev, newDoc].sort((a, b) => a.name.localeCompare(b.name)));
        }
        const apptId = demoId("appt");
        setAppointments((prev) => [
          {
            id: apptId,
            doctorId: doctorId as string,
            specialty,
            appointmentAt: input.appointmentAt,
            reason: input.reason.trim() || null,
            followUpNotes: input.followUpNotes.trim() || null,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        if (input.tasks.length) {
          setTasks((prev) => [
            ...prev,
            ...input.tasks.map((t) => ({ id: demoId("task"), appointmentId: apptId, description: t.description.trim(), dueDate: t.dueDate, reminderAt: t.reminderAt, completedAt: null })),
          ]);
        }
        return;
      }

      let doctorId = input.doctorId;
      let specialty = doctors.find((d) => d.id === doctorId)?.specialty ?? "";
      if (input.newDoctor) {
        await ensureSpecialties([input.newDoctor.specialty]);
        const created = await createDoctor(input.newDoctor);
        setDoctors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        doctorId = created.id;
        specialty = created.specialty;
      }
      if (!doctorId) throw new Error("Pick or add a doctor first.");
      const appt = await createDoctorAppointment({
        doctorId,
        specialty,
        appointmentAt: input.appointmentAt,
        reason: input.reason,
        followUpNotes: input.followUpNotes,
      });
      setAppointments((prev) => [appt, ...prev].sort((a, b) => b.appointmentAt.localeCompare(a.appointmentAt)));
      for (const t of input.tasks) {
        const created = await createDoctorFollowUpTask(appt.id, t);
        setTasks((prev) => [...prev, created]);
      }
    },
    [isDemo, doctors, ensureSpecialties],
  );

  const editAppointment = useCallback(
    async (id: string, patch: AppointmentPatch) => {
      setAppointments((prev) =>
        prev
          .map((a) => (a.id === id ? { ...a, appointmentAt: patch.appointmentAt ?? a.appointmentAt, reason: patch.reason ?? a.reason, followUpNotes: patch.followUpNotes ?? a.followUpNotes } : a))
          .sort((x, y) => y.appointmentAt.localeCompare(x.appointmentAt)),
      );
      if (!isDemo) {
        const updated = await updateDoctorAppointment(id, patch);
        setAppointments((prev) => prev.map((a) => (a.id === id ? updated : a)).sort((x, y) => y.appointmentAt.localeCompare(x.appointmentAt)));
      }
    },
    [isDemo],
  );

  const removeAppointment = useCallback(
    async (id: string) => {
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      setTasks((prev) => prev.filter((t) => t.appointmentId !== id));
      if (!isDemo) await deleteDoctorAppointment(id).catch((err) => console.error("deleteDoctorAppointment failed", err));
    },
    [isDemo],
  );

  // --- Follow-up tasks ---
  const addTask = useCallback(
    async (appointmentId: string, input: NewFollowUpTaskInput) => {
      if (isDemo) {
        setTasks((prev) => [...prev, { id: demoId("task"), appointmentId, description: input.description.trim(), dueDate: input.dueDate, reminderAt: input.reminderAt, completedAt: null }]);
        return;
      }
      const created = await createDoctorFollowUpTask(appointmentId, input);
      setTasks((prev) => [...prev, created]);
    },
    [isDemo],
  );

  const editTask = useCallback(
    async (id: string, patch: FollowUpTaskPatch) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, description: patch.description ?? t.description, dueDate: patch.dueDate === undefined ? t.dueDate : patch.dueDate, reminderAt: patch.reminderAt === undefined ? t.reminderAt : patch.reminderAt } : t,
        ),
      );
      if (!isDemo) {
        const updated = await updateDoctorFollowUpTask(id, patch);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    },
    [isDemo],
  );

  const setTaskComplete = useCallback(
    async (id: string, done: boolean) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completedAt: done ? new Date().toISOString() : null } : t)));
      if (!isDemo) {
        const updated = await setDoctorFollowUpTaskComplete(id, done);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    },
    [isDemo],
  );

  const removeTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (!isDemo) await deleteDoctorFollowUpTask(id).catch((err) => console.error("deleteDoctorFollowUpTask failed", err));
    },
    [isDemo],
  );

  return {
    isDemo,
    loading: (!isDemo && loading) || careLog.loading,
    error: error || careLog.error,
    specialties: { data: specialties, ensure: ensureSpecialties, create: createSpecialty, rename: renameSpecialty, archive: archiveSpecialty, remove: removeSpecialty, setNextAppointment },
    doctors: { data: doctors, edit: editDoctor, remove: removeDoctor },
    appointments: { data: appointments, log: logAppointment, edit: editAppointment, remove: removeAppointment },
    tasks: { data: tasks, add: addTask, edit: editTask, setComplete: setTaskComplete, remove: removeTask },
    careLog: { data: careLog.data, add: careLog.add, edit: careLog.edit, remove: careLog.remove },
  };
}
