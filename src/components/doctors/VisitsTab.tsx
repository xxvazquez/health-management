"use client";

import { useMemo, useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { CareEntry } from "@/lib/supabase/careLog";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { CareEntryForm, CareEntryRow, useSpecialtyNames } from "./careEntries";
import { AppointmentList } from "./AppointmentList";
import { AppointmentForm } from "./AppointmentForm";
import { NextAppointmentField } from "./shared";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { ChoicePanel } from "@/components/ui/ChoicePanel";
import { InlineEmpty } from "@/components/ui/EmptyState";

type DoctorsApi = ReturnType<typeof useDoctors>;
type AddMode = null | "choose" | "note" | "appointment";

function SectionHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {children}
      </h2>
      {hint && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** The Visits tab — everything about doctor appointments, in two sections:
 * "To raise next time" (upcoming appointment dates + the care-log
 * observations and notes waiting for a visit) and "Past visits"
 * (appointments already attended, each with its follow-up tasks inline).
 * Not one interleaved feed — prep and history are separate questions. */
export function VisitsTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [add, setAdd] = useState<AddMode>(null);
  const [editingEntry, setEditingEntry] = useState<CareEntry | null>(null);
  const [filterSpecialty, setFilterSpecialty] = useState("");
  const namesFor = useSpecialtyNames(api);

  const specialtyOptions = resolveSpecialtyNames(
    api.specialties.data,
    api.appointments.data.map((a) => a.specialty),
    api.doctors.data.map((d) => d.specialty),
  );

  const upcoming = useMemo(
    () =>
      api.specialties.data
        .filter((s) => !s.isArchived && s.nextAppointmentDate)
        .sort((a, b) => (a.nextAppointmentDate as string).localeCompare(b.nextAppointmentDate as string)),
    [api.specialties.data],
  );

  const entries = api.careLog.data;
  const supplementNameById = useMemo(
    () => new Map(api.careLog.supplements.map((s) => [s.id, s.name])),
    [api.careLog.supplements],
  );
  const shownEntries = filterSpecialty ? entries.filter((e) => e.specialtyIds.includes(filterSpecialty)) : entries;
  const specialtiesWithEntries = useMemo(() => {
    const ids = new Set(entries.flatMap((e) => e.specialtyIds));
    return api.specialties.data.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, api.specialties.data]);

  if (add === "appointment") {
    return (
      <AppointmentForm
        accent={accent}
        doctors={api.doctors.data}
        specialtyOptions={specialtyOptions}
        onCreate={async (input) => {
          await api.appointments.log(input);
          setAdd(null);
        }}
        onEdit={async () => undefined}
        onCancel={() => setAdd(null)}
      />
    );
  }

  if (add === "note" || editingEntry) {
    return (
      <CareEntryForm
        api={api}
        accent={accent}
        initial={editingEntry ?? undefined}
        supplements={api.careLog.supplements}
        onSave={async (input) => {
          if (editingEntry) await api.careLog.edit(editingEntry.id, input);
          else await api.careLog.add(input);
          setAdd(null);
          setEditingEntry(null);
        }}
        onCancel={() => {
          setAdd(null);
          setEditingEntry(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {add === "choose" && (
        <ChoicePanel
          title="Add to Visits"
          onCancel={() => setAdd(null)}
          options={[
            { label: "Something to raise", onClick: () => setAdd("note") },
            { label: "Log a past appointment", onClick: () => setAdd("appointment") },
          ]}
        />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <SectionHeading hint="Upcoming dates, and what you want to bring up.">To raise next time</SectionHeading>
          <PrimaryAction label="Add" accent={accent} onClick={() => setAdd("choose")} />
        </div>

        {upcoming.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5" style={{ borderColor: "var(--gridline)" }}>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {s.name}
                </span>
                <NextAppointmentField
                  date={s.nextAppointmentDate}
                  onChange={(date) => void api.specialties.setNextAppointment(s.name, date)}
                  accent={accent}
                />
              </li>
            ))}
          </ul>
        )}

        {specialtiesWithEntries.length > 0 && (
          <select
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            className="self-start rounded-md border px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          >
            <option value="">All notes</option>
            {specialtiesWithEntries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {shownEntries.length === 0 ? (
          <InlineEmpty
            title={entries.length === 0 ? "Nothing to raise yet" : "No notes tagged there"}
            description={
              entries.length === 0
                ? "Jot down a symptom you've noticed, a decision you've made, or a question to raise — tag it to the specialties it concerns, and it'll be waiting at your next visit."
                : "Try a different specialty, or clear the filter."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y px-0.5" style={{ borderColor: "var(--gridline)" }}>
            {shownEntries.map((entry) => (
              <CareEntryRow
                key={entry.id}
                entry={entry}
                specialtyNames={namesFor(entry.specialtyIds)}
                supplementName={entry.supplementItemId ? supplementNameById.get(entry.supplementItemId) : null}
                accent={accent}
                onEdit={() => setEditingEntry(entry)}
                onDelete={() => void api.careLog.remove(entry.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t pt-5" style={{ borderColor: "var(--gridline)" }}>
        <SectionHeading hint="Appointments you've already had, with their follow-up tasks.">Past visits</SectionHeading>
        <AppointmentList
          api={api}
          appointments={api.appointments.data}
          accent={accent}
          emptyMessage="No appointments logged yet — use Add to record a visit you've already had."
        />
      </section>
    </div>
  );
}
