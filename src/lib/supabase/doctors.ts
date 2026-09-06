import { supabase } from "./client";
import { DEFAULT_DOCTOR_SPECIALTIES, type DoctorLanguage } from "@/lib/doctors";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";

export interface DoctorSpecialty {
  id: string;
  name: string;
  nextAppointmentDate: string | null;
  isArchived: boolean;
  /** Custom appearance from ui/customIcons — both null falls back to the
   * page's existing hardcoded look. */
  icon: string | null;
  color: string | null;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  rating: number | null;
  language: DoctorLanguage | null;
  createdAt: string;
}

export interface DoctorAppointment {
  id: string;
  doctorId: string;
  /** Frozen at logging time — never rewritten when the doctor's current
   * specialty changes. */
  specialty: string;
  appointmentAt: string;
  reason: string | null;
  followUpNotes: string | null;
  createdAt: string;
}

export interface DoctorFollowUpTask {
  id: string;
  appointmentId: string;
  description: string;
  dueDate: string | null;
  reminderAt: string | null;
  completedAt: string | null;
}

interface SpecialtyRow {
  id: string;
  name: string;
  next_appointment_date: string | null;
  is_archived: boolean;
  icon: string | null;
  color: string | null;
}
interface DoctorRow {
  id: string;
  name: string;
  specialty: string;
  rating: number | null;
  language: string | null;
  created_at: string;
}
interface AppointmentRow {
  id: string;
  doctor_id: string;
  specialty: string;
  appointment_at: string;
  reason: string | null;
  follow_up_notes: string | null;
  created_at: string;
}
interface TaskRow {
  id: string;
  appointment_id: string;
  description: string;
  due_date: string | null;
  reminder_at: string | null;
  completed_at: string | null;
}

const SPECIALTY_COLUMNS = "id, name, next_appointment_date, is_archived, icon, color";
const DOCTOR_COLUMNS = "id, name, specialty, rating, language, created_at";
const APPOINTMENT_COLUMNS = "id, doctor_id, specialty, appointment_at, reason, follow_up_notes, created_at";
const TASK_COLUMNS = "id, appointment_id, description, due_date, reminder_at, completed_at";

function toSpecialty(row: SpecialtyRow): DoctorSpecialty {
  return { id: row.id, name: row.name, nextAppointmentDate: row.next_appointment_date, isArchived: row.is_archived, icon: row.icon, color: row.color };
}
function toDoctor(row: DoctorRow): Doctor {
  return { id: row.id, name: row.name, specialty: row.specialty, rating: row.rating, language: (row.language as DoctorLanguage | null) ?? null, createdAt: row.created_at };
}
function toAppointment(row: AppointmentRow): DoctorAppointment {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    specialty: row.specialty,
    appointmentAt: row.appointment_at,
    reason: row.reason,
    followUpNotes: row.follow_up_notes,
    createdAt: row.created_at,
  };
}
function toTask(row: TaskRow): DoctorFollowUpTask {
  return { id: row.id, appointmentId: row.appointment_id, description: row.description, dueDate: row.due_date, reminderAt: row.reminder_at, completedAt: row.completed_at };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function notConfigured(): Error {
  return new Error("Cloud sync isn't set up for this deployment.");
}

// --- Specialties -------------------------------------------------------

export async function fetchDoctorSpecialties(): Promise<DoctorSpecialty[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from("doctor_specialties").select(SPECIALTY_COLUMNS).eq("user_id", myUserId).order("name", { ascending: true });
  if (error) throw error;
  return (data as SpecialtyRow[]).map(toSpecialty);
}

/** Row-to-payload for an upsert — every column, so an offline create and a
 * later edit of the same still-unsynced row merge into one complete row. */
function specialtyPayload(s: DoctorSpecialty, userId: string): Record<string, unknown> {
  return {
    id: s.id,
    user_id: userId,
    name: s.name.trim(),
    next_appointment_date: s.nextAppointmentDate,
    is_archived: s.isArchived,
    icon: s.icon,
    color: s.color,
    updated_at: new Date().toISOString(),
  };
}

export async function createDoctorSpecialty(name: string): Promise<DoctorSpecialty> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const s: DoctorSpecialty = { id: createTimeOrderedId(), name: name.trim(), nextAppointmentDate: null, isArchived: false, icon: null, color: null };
  await upsertDirect(myUserId, "doctor_specialties", s.id, specialtyPayload(s, myUserId));
  return s;
}

export interface DoctorSpecialtyPatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

/** Takes the full current specialty (not just its id) so an offline save
 * can upsert a complete row — a bare patch can't stand in for a row that
 * may not have reached Supabase yet. */
export async function renameDoctorSpecialty(specialty: DoctorSpecialty, patch: DoctorSpecialtyPatch): Promise<DoctorSpecialty> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: DoctorSpecialty = {
    ...specialty,
    name: patch.name !== undefined ? patch.name.trim() : specialty.name,
    icon: patch.icon !== undefined ? patch.icon : specialty.icon,
    color: patch.color !== undefined ? patch.color : specialty.color,
  };
  await upsertDirect(myUserId, "doctor_specialties", next.id, specialtyPayload(next, myUserId));
  return next;
}

export async function setDoctorSpecialtyArchived(specialty: DoctorSpecialty, archived: boolean): Promise<DoctorSpecialty> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next = { ...specialty, isArchived: archived };
  await upsertDirect(myUserId, "doctor_specialties", next.id, specialtyPayload(next, myUserId));
  return next;
}

export async function deleteDoctorSpecialty(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "doctor_specialties", id);
}

/** Materializes a real row for every default specialty plus any requested
 * names that don't exist yet (case-insensitive) — the direct-to-Supabase
 * counterpart of `ensureCategoryId`. Returns the fresh full list. */
export async function ensureDoctorSpecialties(names: string[] = []): Promise<DoctorSpecialty[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const existing = await fetchDoctorSpecialties();
  const haveKeys = new Set(existing.map((s) => s.name.toLowerCase()));
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...DEFAULT_DOCTOR_SPECIALTIES, ...names]) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || haveKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push(name);
  }
  if (missing.length === 0) return existing;
  const { error } = await supabase.from("doctor_specialties").insert(missing.map((name) => ({ user_id: myUserId, name })));
  if (error) throw error;
  return fetchDoctorSpecialties();
}

/** Sets (or clears) the one next-appointment date for a specialty,
 * materializing its row first so a still-default specialty can hold a date. */
export async function setSpecialtyNextAppointment(name: string, date: string | null): Promise<DoctorSpecialty[]> {
  if (!supabase) throw notConfigured();
  const list = await ensureDoctorSpecialties([name]);
  const target = list.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (!target) throw new Error("Couldn't find that specialty.");
  const { error } = await supabase
    .from("doctor_specialties")
    .update({ next_appointment_date: date, updated_at: new Date().toISOString() })
    .eq("id", target.id);
  if (error) throw error;
  return fetchDoctorSpecialties();
}

// --- Doctors ----------------------------------------------------------

export async function fetchDoctors(): Promise<Doctor[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from("doctors").select(DOCTOR_COLUMNS).eq("user_id", myUserId).order("name", { ascending: true });
  if (error) throw error;
  return (data as DoctorRow[]).map(toDoctor);
}

export interface NewDoctorInput {
  name: string;
  specialty: string;
  rating: number | null;
  language: DoctorLanguage | null;
}

function doctorPayload(d: Doctor, userId: string): Record<string, unknown> {
  return {
    id: d.id,
    user_id: userId,
    name: d.name.trim(),
    specialty: d.specialty.trim(),
    rating: d.rating,
    language: d.language,
    created_at: d.createdAt,
    updated_at: new Date().toISOString(),
  };
}

export async function createDoctor(input: NewDoctorInput): Promise<Doctor> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const d: Doctor = {
    id: createTimeOrderedId(),
    name: input.name.trim(),
    specialty: input.specialty.trim(),
    rating: input.rating,
    language: input.language,
    createdAt: new Date().toISOString(),
  };
  await upsertDirect(myUserId, "doctors", d.id, doctorPayload(d, myUserId));
  return d;
}

export interface DoctorPatch {
  name?: string;
  specialty?: string;
  rating?: number | null;
  language?: DoctorLanguage | null;
}

/** Takes the full current doctor so an offline save can upsert a complete
 * row (see `renameDoctorSpecialty`). */
export async function updateDoctor(doctor: Doctor, patch: DoctorPatch): Promise<Doctor> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: Doctor = {
    ...doctor,
    name: patch.name !== undefined ? patch.name.trim() : doctor.name,
    specialty: patch.specialty !== undefined ? patch.specialty.trim() : doctor.specialty,
    rating: patch.rating !== undefined ? patch.rating : doctor.rating,
    language: patch.language !== undefined ? patch.language : doctor.language,
  };
  await upsertDirect(myUserId, "doctors", next.id, doctorPayload(next, myUserId));
  return next;
}

/** Only offered in the UI for a doctor with no appointments — the `on
 * delete restrict` FK blocks the rest (surfaced as a dead-letter if it
 * somehow slips through while queued offline). */
export async function deleteDoctor(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "doctors", id);
}

// --- Appointments ---------------------------------------------------

export async function fetchDoctorAppointments(): Promise<DoctorAppointment[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("doctor_appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("user_id", myUserId)
    .order("appointment_at", { ascending: false });
  if (error) throw error;
  return (data as AppointmentRow[]).map(toAppointment);
}

export interface NewAppointmentInput {
  doctorId: string;
  /** The doctor's current specialty — copied onto the appointment and frozen. */
  specialty: string;
  appointmentAt: string;
  reason: string;
  followUpNotes: string;
}

function appointmentPayload(a: DoctorAppointment, userId: string): Record<string, unknown> {
  return {
    id: a.id,
    user_id: userId,
    doctor_id: a.doctorId,
    specialty: a.specialty.trim(),
    appointment_at: a.appointmentAt,
    reason: a.reason,
    follow_up_notes: a.followUpNotes,
    created_at: a.createdAt,
    updated_at: new Date().toISOString(),
  };
}

export async function createDoctorAppointment(input: NewAppointmentInput): Promise<DoctorAppointment> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const a: DoctorAppointment = {
    id: createTimeOrderedId(),
    doctorId: input.doctorId,
    specialty: input.specialty.trim(),
    appointmentAt: input.appointmentAt,
    reason: input.reason.trim() || null,
    followUpNotes: input.followUpNotes.trim() || null,
    createdAt: new Date().toISOString(),
  };
  await upsertDirect(myUserId, "doctor_appointments", a.id, appointmentPayload(a, myUserId));
  return a;
}

export interface AppointmentPatch {
  appointmentAt?: string;
  reason?: string;
  followUpNotes?: string;
}

export async function updateDoctorAppointment(appointment: DoctorAppointment, patch: AppointmentPatch): Promise<DoctorAppointment> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: DoctorAppointment = {
    ...appointment,
    appointmentAt: patch.appointmentAt ?? appointment.appointmentAt,
    reason: patch.reason !== undefined ? patch.reason.trim() || null : appointment.reason,
    followUpNotes: patch.followUpNotes !== undefined ? patch.followUpNotes.trim() || null : appointment.followUpNotes,
  };
  await upsertDirect(myUserId, "doctor_appointments", next.id, appointmentPayload(next, myUserId));
  return next;
}

export async function deleteDoctorAppointment(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  // doctor_appointment_tasks cascade on the appointment delete.
  await deleteDirect(myUserId, "doctor_appointments", id);
}

// --- Follow-up tasks ----------------------------------------------

export async function fetchDoctorFollowUpTasks(): Promise<DoctorFollowUpTask[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from("doctor_appointment_tasks").select(TASK_COLUMNS).eq("user_id", myUserId).order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export interface NewFollowUpTaskInput {
  description: string;
  dueDate: string | null;
  reminderAt: string | null;
}

function followUpTaskPayload(t: DoctorFollowUpTask, userId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: t.id,
    user_id: userId,
    appointment_id: t.appointmentId,
    description: t.description.trim(),
    due_date: t.dueDate,
    reminder_at: t.reminderAt,
    completed_at: t.completedAt,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

export async function createDoctorFollowUpTask(appointmentId: string, input: NewFollowUpTaskInput): Promise<DoctorFollowUpTask> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const t: DoctorFollowUpTask = {
    id: createTimeOrderedId(),
    appointmentId,
    description: input.description.trim(),
    dueDate: input.dueDate,
    reminderAt: input.reminderAt,
    completedAt: null,
  };
  await upsertDirect(myUserId, "doctor_appointment_tasks", t.id, followUpTaskPayload(t, myUserId));
  return t;
}

export interface FollowUpTaskPatch {
  description?: string;
  dueDate?: string | null;
  reminderAt?: string | null;
}

export async function updateDoctorFollowUpTask(task: DoctorFollowUpTask, patch: FollowUpTaskPatch): Promise<DoctorFollowUpTask> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: DoctorFollowUpTask = {
    ...task,
    description: patch.description !== undefined ? patch.description.trim() : task.description,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : task.dueDate,
    reminderAt: patch.reminderAt !== undefined ? patch.reminderAt : task.reminderAt,
  };
  // A changed reminder time re-arms the cron for the new moment.
  const extra = patch.reminderAt !== undefined ? { reminder_sent_at: null } : undefined;
  await upsertDirect(myUserId, "doctor_appointment_tasks", next.id, followUpTaskPayload(next, myUserId, extra));
  return next;
}

export async function setDoctorFollowUpTaskComplete(task: DoctorFollowUpTask, done: boolean): Promise<DoctorFollowUpTask> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next = { ...task, completedAt: done ? new Date().toISOString() : null };
  await upsertDirect(myUserId, "doctor_appointment_tasks", next.id, followUpTaskPayload(next, myUserId));
  return next;
}

export async function deleteDoctorFollowUpTask(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "doctor_appointment_tasks", id);
}
