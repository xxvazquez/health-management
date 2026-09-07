import type { CareEntry } from "@/lib/supabase/careLog";
import { demoSupplementItems } from "@/lib/demoData";

/** Example care-log entries for the Medical page when signed out —
 * interactive, in-memory only, nothing saved. The specialty IDs match the
 * demo rows built by `buildDemoDoctorSpecialties`. */
const DAY = 24 * 60 * 60 * 1000;
const demoMagnesiumId = demoSupplementItems().find((s) => s.name === "Magnesium")?.id ?? null;
const dateOnly = (msOffset: number) => new Date(Date.now() + msOffset).toISOString().slice(0, 10);
const iso = (msOffset: number) => new Date(Date.now() + msOffset).toISOString();

/** Mirrors `demo-spec-${name.toLowerCase().replace(/[^a-z]+/g, "-")}` from demoDoctors.ts. */
function demoSpecialtyId(name: string): string {
  return `demo-spec-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

export function buildDemoCareEntries(): CareEntry[] {
  return [
    {
      id: "demo-care-tooth",
      happenedOn: dateOnly(-3 * DAY),
      kind: "observation",
      title: "Sharp pain, upper-left molar",
      body: "Worse with cold, comes and goes. Started about 3 days ago — mention at the next dental check.",
      remindOn: null,
      supplementItemId: null,
      attachments: [],
      specialtyIds: [demoSpecialtyId("Dentist"), demoSpecialtyId("Endodontist")],
      createdAt: iso(-3 * DAY),
    },
    {
      id: "demo-care-iron",
      happenedOn: dateOnly(-12 * DAY),
      kind: "note",
      title: "Ask about taking iron with vitamin C",
      body: "Read that vitamin C helps absorption. Worth checking whether it matters at the dose I'm on.",
      remindOn: null,
      supplementItemId: null,
      attachments: [],
      specialtyIds: [demoSpecialtyId("Gastroenterologist"), demoSpecialtyId("Internist (GP)")],
      createdAt: iso(-12 * DAY),
    },
    {
      id: "demo-care-magnesium",
      happenedOn: dateOnly(-15 * DAY),
      kind: "decision",
      title: "Moved magnesium to 400mg at night",
      body: "GP suggested trying it in the evening for the 3am waking. Recheck how sleep is going in a few weeks.",
      remindOn: dateOnly(21 * DAY),
      supplementItemId: demoMagnesiumId,
      attachments: [],
      specialtyIds: [demoSpecialtyId("Internist (GP)")],
      createdAt: iso(-15 * DAY),
    },
    {
      id: "demo-care-magnesium-start",
      happenedOn: dateOnly(-90 * DAY),
      kind: "decision",
      title: "Started magnesium, 200mg with breakfast",
      body: "For cramps and sleep. GP was fine with it; said to give it a couple of months.",
      remindOn: null,
      supplementItemId: demoMagnesiumId,
      attachments: [],
      specialtyIds: [demoSpecialtyId("Internist (GP)")],
      createdAt: iso(-90 * DAY),
    },
    {
      id: "demo-care-sleep",
      happenedOn: dateOnly(-20 * DAY),
      kind: "observation",
      title: "Waking around 3am most nights",
      body: "Roughly the last two weeks. Not obviously stress-related.",
      remindOn: null,
      supplementItemId: null,
      attachments: [],
      specialtyIds: [demoSpecialtyId("Internist (GP)")],
      createdAt: iso(-20 * DAY),
    },
  ];
}
