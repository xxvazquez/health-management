import { supabase, supabaseConfigured } from "./client";
import { DEFAULT_DOCTOR_SPECIALTIES, type DoctorLanguage } from "@/lib/doctors";

/** Same "is cloud set up" flag as journal/notes/personalReminders — Doctors
 * has no offline/local-only mode, an appointment only exists once it's
 * saved to your account. */
export const doctorsConfigured = supabaseConfigured;

export interface DoctorSpecialty {
  id: string;
  name: string;
  nextAppointmentDate: string | null;
  isArchived: boolean;
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

const SPECIALTY_COLUMNS = "id, name, next_appointment_date, is_archived";
const DOCTOR_COLUMNS = "id, name, specialty, rating, language, created_at";
const APPOINTMENT_COLUMNS = "id, doctor_id, specialty, appointment_at, reason, follow_up_notes, created_at";
const TASK_COLUMNS = "id, appointment_id, description, due_date, reminder_at, completed_at";

function toSpecialty(row: SpecialtyRow): DoctorSpecialty {
  return { id: row.id, name: row.name, nextAppointmentDate: row.next_appointment_date, isArchived: row.is_archived };
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

export async function createDoctorSpecialty(name: string): Promise<DoctorSpecialty> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase.from("doctor_specialties").insert({ user_id: myUserId, name: name.trim() }).select(SPECIALTY_COLUMNS).single();
  if (error) throw error;
  return toSpecialty(data as SpecialtyRow);
}

export async function renameDoctorSpecialty(id: string, name: string): Promise<DoctorSpecialty> {
  if (!supabase) throw notConfigured();
  const { data, error } = await supabase
    .from("doctor_specialties")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SPECIALTY_COLUMNS)
    .single();
  if (error) throw error;
  return toSpecialty(data as SpecialtyRow);
}

export async function setDoctorSpecialtyArchived(id: string, archived: boolean): Promise<DoctorSpecialty> {
  if (!supabase) throw notConfigured();
  const { data, error } = await supabase
    .from("doctor_specialties")
    .update({ is_archived: archived, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SPECIALTY_COLUMNS)
    .single();
  if (error) throw error;
  return toSpecialty(data as SpecialtyRow);
}

export async function deleteDoctorSpecialty(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("doctor_specialties").delete().eq("id", id);
  if (error) throw error;
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

export async function createDoctor(input: NewDoctorInput): Promise<Doctor> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("doctors")
    .insert({ user_id: myUserId, name: input.name.trim(), specialty: input.specialty.trim(), rating: input.rating, language: input.language })
    .select(DOCTOR_COLUMNS)
    .single();
  if (error) throw error;
  return toDoctor(data as DoctorRow);
}

export interface DoctorPatch {
  name?: string;
  specialty?: string;
  rating?: number | null;
  language?: DoctorLanguage | null;
}

export async function updateDoctor(id: string, patch: DoctorPatch): Promise<Doctor> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.specialty !== undefined) update.specialty = patch.specialty.trim();
  if (patch.rating !== undefined) update.rating = patch.rating;
  if (patch.language !== undefined) update.language = patch.language;
  const { data, error } = await supabase.from("doctors").update(update).eq("id", id).select(DOCTOR_COLUMNS).single();
  if (error) throw error;
  return toDoctor(data as DoctorRow);
}

/** Only succeeds for a doctor with no appointments — the `on delete
 * restrict` FK blocks the rest, surfaced to the caller. */
export async function deleteDoctor(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("doctors").delete().eq("id", id);
  if (error) throw error;
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

export async function createDoctorAppointment(input: NewAppointmentInput): Promise<DoctorAppointment> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("doctor_appointments")
    .insert({
      user_id: myUserId,
      doctor_id: input.doctorId,
      specialty: input.specialty.trim(),
      appointment_at: input.appointmentAt,
      reason: input.reason.trim() || null,
      follow_up_notes: input.followUpNotes.trim() || null,
    })
    .select(APPOINTMENT_COLUMNS)
    .single();
  if (error) throw error;
  return toAppointment(data as AppointmentRow);
}

export interface AppointmentPatch {
  appointmentAt?: string;
  reason?: string;
  followUpNotes?: string;
}

export async function updateDoctorAppointment(id: string, patch: AppointmentPatch): Promise<DoctorAppointment> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.appointmentAt !== undefined) update.appointment_at = patch.appointmentAt;
  if (patch.reason !== undefined) update.reason = patch.reason.trim() || null;
  if (patch.followUpNotes !== undefined) update.follow_up_notes = patch.followUpNotes.trim() || null;
  const { data, error } = await supabase.from("doctor_appointments").update(update).eq("id", id).select(APPOINTMENT_COLUMNS).single();
  if (error) throw error;
  return toAppointment(data as AppointmentRow);
}

export async function deleteDoctorAppointment(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("doctor_appointments").delete().eq("id", id);
  if (error) throw error;
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

export async function createDoctorFollowUpTask(appointmentId: string, input: NewFollowUpTaskInput): Promise<DoctorFollowUpTask> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("doctor_appointment_tasks")
    .insert({ user_id: myUserId, appointment_id: appointmentId, description: input.description.trim(), due_date: input.dueDate, reminder_at: input.reminderAt })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export interface FollowUpTaskPatch {
  description?: string;
  dueDate?: string | null;
  reminderAt?: string | null;
}

export async function updateDoctorFollowUpTask(id: string, patch: FollowUpTaskPatch): Promise<DoctorFollowUpTask> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.reminderAt !== undefined) {
    update.reminder_at = patch.reminderAt;
    // A changed reminder time re-arms the cron for the new moment.
    update.reminder_sent_at = null;
  }
  const { data, error } = await supabase.from("doctor_appointment_tasks").update(update).eq("id", id).select(TASK_COLUMNS).single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function setDoctorFollowUpTaskComplete(id: string, done: boolean): Promise<DoctorFollowUpTask> {
  if (!supabase) throw notConfigured();
  const { data, error } = await supabase
    .from("doctor_appointment_tasks")
    .update({ completed_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function deleteDoctorFollowUpTask(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("doctor_appointment_tasks").delete().eq("id", id);
  if (error) throw error;
}
