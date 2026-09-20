"use client";

import { TabRail } from "@/components/ui/TabRail";
import { useMemo, useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { CareEntry, CareEntryKind } from "@/lib/supabase/careLog";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { CARE_KIND_LABEL, CareEntryDetail, CareEntryForm, CareEntryRow, useSpecialtyNames } from "./careEntries";
import { AppointmentList } from "./AppointmentList";
import { AppointmentForm } from "./AppointmentForm";
import { NextAppointmentField } from "./shared";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { ChoicePanel } from "@/components/ui/ChoicePanel";
import { InlineEmpty } from "@/components/ui/EmptyState";

type DoctorsApi = ReturnType<typeof useDoctors>;
type AddMode = null | "choose" | "note" | "appointment";

/** Decisions and notes first, observations last — otherwise the most
 * frequently logged kind (a symptom noticed day to day) buries the rarer,
 * more consequential entries under sheer recency. */
const KIND_GROUP_ORDER: CareEntryKind[] = ["decision", "note", "observation"];

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
 * "Before your next visit" (upcoming appointment dates + the care-log
 * observations and notes waiting for a visit) and "Past visits"
 * (appointments already attended, each with its follow-up tasks inline).
 * Not one interleaved feed — prep and history are separate questions. */
export function VisitsTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [add, setAdd] = useState<AddMode>(null);
  const [editingEntry, setEditingEntry] = useState<CareEntry | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
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
  const viewing = viewingId ? (entries.find((e) => e.id === viewingId) ?? null) : null;
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

  if (viewing && !editingEntry && add !== "note") {
    return (
      <CareEntryDetail
        entry={viewing}
        specialtyNames={namesFor(viewing.specialtyIds)}
        supplementName={viewing.supplementItemId ? supplementNameById.get(viewing.supplementItemId) : null}
        accent={accent}
        onBack={() => setViewingId(null)}
        onEdit={() => setEditingEntry(viewing)}
        onDelete={() => {
          void api.careLog.remove(viewing.id);
          setViewingId(null);
        }}
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
          <SectionHeading hint="Upcoming dates, and what you want to bring up.">Before your next visit</SectionHeading>
          <PrimaryAction label="Add" accent={accent} onClick={() => setAdd("choose")} />
        </div>

        {upcoming.length > 0 && (
          <ul className="inset-rows flex flex-col rounded-xl border [--row-inset:0.75rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {upcoming.map((s) => (
              <li key={s.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {s.name}
                </span>
                <NextAppointmentField
                  date={s.nextAppointmentDate}
                  onChange={(date) => void api.specialties.setNextAppointment(s.name, date)}
                  accent={accent}
                  hideLabel
                />
              </li>
            ))}
          </ul>
        )}

        {specialtiesWithEntries.length > 0 && (
          <TabRail
            ariaLabel="Filter notes by specialty"
            wrap={false}
            tall
            className="border-b"
            style={{ borderColor: "var(--border-hairline)" }}
            items={[{ id: "", name: "All notes" }, ...specialtiesWithEntries].map((s) => ({ id: s.id, label: s.name, accent }))}
            activeId={filterSpecialty}
            onSelect={setFilterSpecialty}
          />
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
          <div className="flex flex-col gap-4">
            {KIND_GROUP_ORDER.map((kind) => {
              const group = shownEntries.filter((entry) => entry.kind === kind);
              if (group.length === 0) return null;
              return (
                <div key={kind} className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                    {CARE_KIND_LABEL[kind]}s
                  </h3>
                  <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                    {group.map((entry) => (
                      <CareEntryRow
                        key={entry.id}
                        entry={entry}
                        specialtyNames={namesFor(entry.specialtyIds)}
                        supplementName={entry.supplementItemId ? supplementNameById.get(entry.supplementItemId) : null}
                        accent={accent}
                        onOpen={() => setViewingId(entry.id)}
                        onEdit={() => setEditingEntry(entry)}
                        onDelete={() => void api.careLog.remove(entry.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
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
