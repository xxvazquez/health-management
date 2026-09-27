"use client";

import { TabRail } from "@/components/ui/TabRail";
import { useMemo, useState } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import type { CareEntry, CareEntryKind } from "@/lib/supabase/careLog";
import { resolveSpecialtyNames } from "@/lib/doctors";
import { CARE_KIND_LABEL, CareEntryDetail, CareEntryForm, CareEntryRow, useSpecialtyNames } from "./careEntries";
import { AppointmentList } from "./AppointmentList";
import { AppointmentForm } from "./AppointmentForm";
import { formatShortDate } from "./shared";
import { DatePicker } from "@/components/ui/DatePicker";
import { ChevronIcon } from "@/components/ui/icons";
import { AddMenu } from "@/components/ui/AddMenu";
import { InlineEmpty } from "@/components/ui/EmptyState";

type DoctorsApi = ReturnType<typeof useDoctors>;
export type VisitsAddMode = null | "note" | "appointment";

/** Decisions and notes first, observations last — otherwise the most
 * frequently logged kind (a symptom noticed day to day) buries the rarer,
 * more consequential entries under sheer recency. */
const KIND_GROUP_ORDER: CareEntryKind[] = ["decision", "note", "observation"];

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
      {children}
    </h3>
  );
}

/** The "+ Add" menu for Visits — rendered in the Health page's title row. */
export function VisitsAddMenu({ accent, onAdd }: { accent: string; onAdd: (mode: VisitsAddMode) => void }) {
  return (
    <AddMenu
      accent={accent}
      options={[
        { label: "Something to raise", onClick: () => onAdd("note") },
        { label: "Log a past appointment", onClick: () => onAdd("appointment") },
      ]}
    />
  );
}

/** The Visits tab — grouped lists, top to bottom: upcoming appointment
 * dates, the care-log entries waiting for a visit (decisions, notes,
 * observations, filterable by specialty), then past visits with their open
 * follow-ups. Adding happens from `VisitsAddMenu` in the page title row. */
export function VisitsTab({
  api,
  accent,
  add,
  setAdd,
}: {
  api: DoctorsApi;
  accent: string;
  add: VisitsAddMode;
  setAdd: (mode: VisitsAddMode) => void;
}) {
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

  const appointmentSheet = add === "appointment" ? (
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
  ) : null;

  const entrySheet = add === "note" || editingEntry ? (
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
  ) : null;

  if (viewing) {
    return (
      <>
        {entrySheet}
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
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {entrySheet}
      {appointmentSheet}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Caption>Upcoming</Caption>
          <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {upcoming.map((s) => (
              <li key={s.id} className="[&>div]:block">
                <DatePicker
                  value={s.nextAppointmentDate ?? ""}
                  onChange={(v) => void api.specialties.setNextAppointment(s.name, v || null)}
                  optional
                  title={`Next ${s.name} appointment`}
                  renderTrigger={(open) => (
                    <button type="button" onClick={open} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-sm">
                      <span className="min-w-0 flex-1" style={{ color: "var(--text-primary)" }}>
                        {s.name}
                      </span>
                      <span className="shrink-0 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {formatShortDate(s.nextAppointmentDate as string, { weekday: true })}
                      </span>
                      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        <ChevronIcon size={14} />
                      </span>
                    </button>
                  )}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {specialtiesWithEntries.length > 0 && (
          <TabRail
            ariaLabel="Filter notes by specialty"
            wrap={false}
            tall
            style={{ borderColor: "var(--border-hairline)" }}
            items={[{ id: "", name: "All" }, ...specialtiesWithEntries].map((s) => ({ id: s.id, label: s.name, accent }))}
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
                  <Caption>{CARE_KIND_LABEL[kind]}s</Caption>
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

      <section className="flex flex-col gap-1.5">
        <Caption>Past visits</Caption>
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
