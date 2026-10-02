"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { useDoctors } from "@/lib/useDoctors";
import { useLabs } from "@/lib/useLabs";
import { useVitals } from "@/lib/useVitals";
import { usePreferences } from "@/lib/usePreferences";
import { localizeLabs } from "@/lib/labNames";
import { addDaysToDate, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import { markerHighlights } from "@/lib/aggregations/labs";
import { currentSupplements, symptomSummaries } from "@/lib/aggregations/visitSummary";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/icons";
import { InlineEmpty, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import { fmtNum, lastTestNote } from "@/components/doctors/LabsOverview";
import { optimalStatusColor } from "@/components/doctors/labStatus";
import { formatDate } from "@/components/doctors/shared";

type Period = "3M" | "6M" | "1Y";
const PERIOD_DAYS: Record<Period, number> = { "3M": 91, "6M": 182, "1Y": 365 };
const KIND_LABEL = { observation: "Observation", note: "Note", decision: "Decision" } as const;

function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** Prints in light colours whatever the app's theme, then puts it back. */
function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement;
    let saved: string | undefined;
    const before = () => {
      saved = root.dataset.theme;
      root.dataset.theme = "light";
    };
    const after = () => {
      if (saved) root.dataset.theme = saved;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}

function Section({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <TrendGroup caption={caption}>{children}</TrendGroup>
    </div>
  );
}

/** Health → Doctors → a doctor → Visit summary: one page to bring to an
 * appointment — symptoms, blood results, vitals, what's being taken, the
 * care notes for that specialty and open follow-ups, for a chosen period.
 * Print or save it as a PDF from the browser. */
export default function VisitSummaryPage() {
  const api = useDoctors();
  const rawLabs = useLabs();
  const vitals = useVitals();
  const { events } = useData();
  const { prefs } = usePreferences();
  const labs = useMemo(() => localizeLabs(rawLabs, prefs.labNameLanguage === "en" ? "en" : "pl"), [rawLabs, prefs.labNameLanguage]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("6M");
  usePrintInLight();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL on arrival
    setDoctorId(new URL(window.location.href).searchParams.get("doctor"));
  }, []);

  const today = todayLocalISODate();
  const range: DateRange = useMemo(() => ({ start: addDaysToDate(today, -(PERIOD_DAYS[period] - 1)), end: today }), [today, period]);
  const inRange = (date: string) => date >= range.start && date <= range.end;

  const symptoms = useMemo(() => symptomSummaries(events, range), [events, range]);
  const supplements = useMemo(() => currentSupplements(events, range), [events, range]);
  const lab = useMemo(() => markerHighlights(labs.markers.data, range.start, range.end), [labs.markers.data, range]);

  const back = (
    <Link href="/medical/#doctors" className="-ml-1 flex min-h-11 items-center gap-0.5 text-sm font-medium print:hidden" style={{ color: "var(--ui-accent)" }}>
      <ChevronIcon dir="left" size={16} />
      Doctors
    </Link>
  );

  if (api.error) return <ErrorState what="your doctors" />;
  if (api.loading || doctorId === null) return <ListSkeleton />;
  const doctor = api.doctors.data.find((d) => d.id === doctorId);
  if (!doctor) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <InlineEmpty title="Doctor not found" description="Open a summary from a doctor on Health → Doctors." />
      </div>
    );
  }

  const specialty = api.specialties.data.find((s) => s.name.toLowerCase() === doctor.specialty.toLowerCase()) ?? null;
  const visits = api.appointments.data.filter((a) => a.doctorId === doctor.id);
  const visitIds = new Set(visits.map((a) => a.id));
  const openTasks = api.tasks.data.filter((t) => visitIds.has(t.appointmentId) && !t.completedAt);
  const visitsInRange = visits.filter((a) => inRange(a.appointmentAt.slice(0, 10))).sort((a, b) => b.appointmentAt.localeCompare(a.appointmentAt));
  const careNotes = specialty
    ? api.careLog.data.filter((c) => c.specialtyIds.includes(specialty.id) && inRange(c.happenedOn)).sort((a, b) => b.happenedOn.localeCompare(a.happenedOn))
    : [];
  const decisionsBySupplement = new Map(api.careLog.data.filter((c) => c.kind === "decision" && c.supplementItemId).map((c) => [c.supplementItemId!, c.title]));

  const bp = vitals.bp.data.filter((r) => inRange(r.measuredAt.slice(0, 10)));
  const weight = vitals.weight.data.filter((r) => inRange(r.measuredAt.slice(0, 10)));
  const avg = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const weightChange = weight.length >= 2 ? Math.round((weight[0].kg - weight[weight.length - 1].kg) * 10) / 10 : null;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        {back}
        <h1 className="text-2xl leading-tight font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Visit summary
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {[doctor.name, doctor.specialty].filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {formatDate(range.start)} – {formatDate(range.end)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 print:hidden">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            ["3M", "3M"],
            ["6M", "6M"],
            ["1Y", "1Y"],
          ]}
        />
        <Button variant="tinted" size="sm" onClick={() => window.print()}>
          Print or PDF
        </Button>
      </div>

      {symptoms.length > 0 && (
        <Section caption={`Symptoms · ${days(symptoms[0].trackedDays)} logged`}>
          {symptoms.slice(0, 10).map((s) => (
            <TrendRow
              key={s.item}
              label={s.item}
              sublabel={
                [s.averageLevel != null ? `Level ${s.averageLevel.toFixed(1)} of 3` : null, s.previous ? `was ${s.previous.days} of ${s.previous.trackedDays}` : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              value={days(s.days)}
            />
          ))}
        </Section>
      )}

      {lab.measured > 0 && (
        <Section caption={`Blood results · ${lab.measured} ${lab.measured === 1 ? "marker" : "markers"} tested`}>
          {lab.items.length === 0 ? (
            <TrendRow label="All in range" sublabel="Nothing moved much since the results before" />
          ) : (
            lab.items.map((item) => {
              const flag = item.status === "high" ? "H" : item.status === "low" ? "L" : "";
              return (
                <TrendRow
                  key={item.marker.id}
                  label={item.marker.name}
                  sublabel={lastTestNote(item)}
                  value={
                    <span className="flex items-baseline gap-1">
                      <span style={{ color: optimalStatusColor(item.status) }}>{fmtNum(item.value)}</span>
                      {item.marker.unit && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {item.marker.unit}
                        </span>
                      )}
                      {flag && (
                        <span className="font-semibold" style={{ color: optimalStatusColor(item.status) }}>
                          {flag}
                        </span>
                      )}
                    </span>
                  }
                />
              );
            })
          )}
        </Section>
      )}

      {(bp.length > 0 || weight.length > 0) && (
        <Section caption="Vitals">
          {bp.length > 0 && (
            <TrendRow
              label="Blood pressure"
              sublabel={`Average ${avg(bp.map((r) => r.systolic))}/${avg(bp.map((r) => r.diastolic))} over ${bp.length} ${bp.length === 1 ? "reading" : "readings"}`}
              value={`${bp[0].systolic}/${bp[0].diastolic} · ${formatDate(bp[0].measuredAt)}`}
            />
          )}
          {weight.length > 0 && (
            <TrendRow
              label="Weight"
              sublabel={weightChange !== null ? `${weightChange > 0 ? "+" : weightChange < 0 ? "−" : "±"}${Math.abs(weightChange)} kg over the period` : undefined}
              value={`${weight[0].kg} kg · ${formatDate(weight[0].measuredAt)}`}
            />
          )}
        </Section>
      )}

      {supplements.length > 0 && (
        <Section caption="Supplements and medication · last 4 weeks">
          {supplements.map((s) => (
            <TrendRow
              key={s.item}
              label={s.item}
              sublabel={[s.category, decisionsBySupplement.get(s.itemIdentity)].filter(Boolean).join(" · ")}
              value={`${s.recentDays} of 28 days`}
            />
          ))}
        </Section>
      )}

      {careNotes.length > 0 && (
        <Section caption={`${specialty!.name} notes`}>
          {careNotes.map((c) => (
            <TrendRow key={c.id} label={c.title} sublabel={`${KIND_LABEL[c.kind]} · ${formatDate(c.happenedOn)}`} />
          ))}
        </Section>
      )}

      {openTasks.length > 0 && (
        <Section caption="Open follow-ups">
          {openTasks.map((t) => (
            <TrendRow key={t.id} label={t.description} value={t.dueDate ? formatDate(t.dueDate) : undefined} />
          ))}
        </Section>
      )}

      {visitsInRange.length > 0 && (
        <Section caption={`Visits with ${doctor.name}`}>
          {visitsInRange.map((a) => (
            <TrendRow key={a.id} label={formatDate(a.appointmentAt)} sublabel={a.reason ?? undefined} />
          ))}
        </Section>
      )}
    </div>
  );
}
