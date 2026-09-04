import type { Doctor, DoctorAppointment, DoctorFollowUpTask, DoctorSpecialty } from "@/lib/supabase/doctors";
import { DEFAULT_DOCTOR_SPECIALTIES } from "@/lib/doctors";

/** Example data for the Medical page when signed out — same idea as
 * demoPersonalReminders.ts: interactive, in-memory only, nothing saved.
 * Includes a rating-1 doctor so the red "bad doctor" treatment is visible
 * before signing in. */
const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const iso = (msOffset: number) => new Date(now() + msOffset).toISOString();
const dateOnly = (msOffset: number) => new Date(now() + msOffset).toISOString().slice(0, 10);

const DEMO_DOCTOR_KOWALSKA = "demo-doctor-kowalska";
const DEMO_DOCTOR_NOWAK = "demo-doctor-nowak";
const DEMO_DOCTOR_GARCIA = "demo-doctor-garcia";

const DEMO_APPT_TEETH = "demo-appt-teeth";
const DEMO_APPT_CHECKUP = "demo-appt-checkup";
const DEMO_APPT_USG = "demo-appt-usg";

export function buildDemoDoctorSpecialties(): DoctorSpecialty[] {
  const nextDates: Record<string, string> = {
    Dentist: dateOnly(9 * DAY),
    Gynecologist: dateOnly(60 * DAY),
  };
  return DEFAULT_DOCTOR_SPECIALTIES.map((name) => ({
    id: `demo-spec-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    name,
    nextAppointmentDate: nextDates[name] ?? null,
    isArchived: false,
    icon: null,
    color: null,
  }));
}

export function buildDemoDoctors(): Doctor[] {
  return [
    { id: DEMO_DOCTOR_KOWALSKA, name: "Dr Kowalska", specialty: "Dentist", rating: 3, language: "Polish", createdAt: iso(-120 * DAY) },
    { id: DEMO_DOCTOR_NOWAK, name: "Dr Nowak", specialty: "Internist (GP)", rating: 1, language: "Polish", createdAt: iso(-90 * DAY) },
    { id: DEMO_DOCTOR_GARCIA, name: "Dr García", specialty: "Gynecologist", rating: 2, language: "Spanish", createdAt: iso(-200 * DAY) },
  ];
}

export function buildDemoDoctorAppointments(): DoctorAppointment[] {
  return [
    {
      id: DEMO_APPT_TEETH,
      doctorId: DEMO_DOCTOR_KOWALSKA,
      specialty: "Dentist",
      appointmentAt: iso(-14 * DAY),
      reason: "Molar pain, upper left",
      followUpNotes: "Small cavity found. Recommended a CT scan before deciding on root canal.",
      createdAt: iso(-14 * DAY),
    },
    {
      id: DEMO_APPT_CHECKUP,
      doctorId: DEMO_DOCTOR_NOWAK,
      specialty: "Internist (GP)",
      appointmentAt: iso(-45 * DAY),
      reason: "Annual check-up, blood work",
      followUpNotes: "Vitamin D low. Retest in 3 months.",
      createdAt: iso(-45 * DAY),
    },
    {
      id: DEMO_APPT_USG,
      doctorId: DEMO_DOCTOR_GARCIA,
      specialty: "Gynecologist",
      appointmentAt: iso(-30 * DAY),
      reason: "Routine visit",
      followUpNotes: "Everything normal. USG scan requested for next visit.",
      createdAt: iso(-30 * DAY),
    },
  ];
}

export function buildDemoDoctorFollowUpTasks(): DoctorFollowUpTask[] {
  return [
    { id: "demo-task-ct", appointmentId: DEMO_APPT_TEETH, description: "Book the CT scan", dueDate: dateOnly(4 * DAY), reminderAt: iso(-1 * DAY), completedAt: null },
    { id: "demo-task-vitd", appointmentId: DEMO_APPT_CHECKUP, description: "Repeat vitamin D blood test", dueDate: dateOnly(45 * DAY), reminderAt: null, completedAt: null },
    { id: "demo-task-usg", appointmentId: DEMO_APPT_USG, description: "Do the USG scan", dueDate: null, reminderAt: null, completedAt: iso(-5 * DAY) },
  ];
}
