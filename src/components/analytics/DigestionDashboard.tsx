"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ChevronIcon } from "@/components/ui/icons";
import { TrendsActions } from "@/components/analytics/TrendsActions";
import { ShowAllRow, SplitStatCard, TrendCaption, TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import { DEFAULT_PRESETS, DateRangeFilter, describeDateRange } from "@/components/ui/DateRangeFilter";
import { BristolDotChart, bristolColor } from "@/components/charts/BristolDotChart";
import { DEFAULT_RANGE_DAYS, useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate, daysBetween, filterByDateRange, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import {
  averageTimeOnToiletMinutes,
  bristolBandDistribution,
  bristolScoreSeries,
  digestiveSymptomDays,
  digestiveSymptomDetail,
  digestiveSymptomStats,
  hygieneDistribution,
  movementSummary,
  stoolColorDistribution,
  withMovementStats,
  type SymptomDaysCount,
} from "@/lib/aggregations/digestion";

const ACCENT = "var(--series-indigo)";
const SYMPTOM_COLOR = "var(--series-8)";
const SYMPTOMS_SHOWN = 4;
const MOVEMENT_ROWS_SHOWN = 3;

const BANDS = [
  { band: "Hard (1–2)", label: "Hard", range: "1–2", color: bristolColor(1) },
  { band: "Normal (3–4)", label: "Normal", range: "3–4", color: bristolColor(3) },
  { band: "Loose (5–7)", label: "Loose", range: "5–7", color: bristolColor(5) },
] as const;

/** "Last 30 days", "All time" or "3 Sept – 1 Oct" — the caption suffix. */
function rangeText(span: DateRange, range: DateRange): string {
  const label = describeDateRange(DEFAULT_PRESETS, span, range);
  return /^\d/.test(label) ? `Last ${label}` : label;
}

/** "was 12 of 30", green when there were fewer symptom days than before, red when more. */
function changeDetail(now: SymptomDaysCount, before: SymptomDaysCount): { detail?: string; detailColor?: string } {
  if (before.trackedDays === 0 || now.trackedDays === 0) return {};
  // Less than a day's difference, scaled to this period's logged days, is no change.
  const diff = now.days - (before.days / before.trackedDays) * now.trackedDays;
  return {
    detail: `was ${before.days} of ${before.trackedDays}`,
    detailColor: diff <= -1 ? "var(--status-good)" : diff >= 1 ? "var(--status-critical)" : undefined,
  };
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDaysToDate(today, -1)) return "Yesterday";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
}

function HealthCard({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <TrendCaption>{caption}</TrendCaption>
      <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {children}
      </div>
    </section>
  );
}

export function DigestionDashboard() {
  const { status, events, stoolLogs } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events, DEFAULT_RANGE_DAYS);
  const [openSymptom, setOpenSymptom] = useState<string | null>(null);
  const [showAllSymptoms, setShowAllSymptoms] = useState(false);
  const [showAllMovement, setShowAllMovement] = useState(false);

  // A symptom opens as its own screen with a history entry, so Back and the
  // edge swipe return to the overview.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOpenSymptom(e.state?.digestionSymptom ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function openDetail(item: string) {
    window.history.pushState({ ...window.history.state, digestionSymptom: item }, "");
    setOpenSymptom(item);
    window.scrollTo(0, 0);
  }

  const rangeStools = useMemo(() => filterByDateRange(stoolLogs, range ?? undefined), [stoolLogs, range]);
  const dots = useMemo(() => bristolScoreSeries(rangeStools), [rangeStools]);
  const bands = useMemo(() => bristolBandDistribution(rangeStools), [rangeStools]);
  const movements = useMemo(() => (range ? movementSummary(stoolLogs, range) : null), [stoolLogs, range]);
  const symptomDays = useMemo(() => (range ? digestiveSymptomDays(events, range) : null), [events, range]);
  const symptoms = useMemo(() => digestiveSymptomStats(filtered).filter((s) => s.daysCompleted > 0).sort((a, b) => b.daysCompleted - a.daysCompleted || a.item.localeCompare(b.item)), [filtered]);
  const withMovement = useMemo(() => withMovementStats(rangeStools), [rangeStools]);
  const colour = useMemo(() => stoolColorDistribution(rangeStools)[0], [rangeStools]);
  const hygiene = useMemo(() => hygieneDistribution(rangeStools)[0], [rangeStools]);
  const toiletMinutes = useMemo(() => averageTimeOnToiletMinutes(rangeStools), [rangeStools]);
  const detail = useMemo(() => (openSymptom && range ? digestiveSymptomDetail(events, openSymptom, range) : null), [events, openSymptom, range]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;
  if (!span || !range) return null;

  const when = rangeText(span, range);
  const today = todayLocalISODate();
  const filter = (
    <TrendsActions>
      <DateRangeFilter span={span} value={range} onChange={setRange} accent={ACCENT} />
    </TrendsActions>
  );

  if (openSymptom && detail) {
    const maxBar = Math.max(...detail.bars.map((b) => b.value ?? 0), 0);
    const change = changeDetail(detail.now, detail.before);
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {filter}
        <div>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="-ml-1 flex min-h-11 items-center gap-0.5 text-sm font-medium"
            style={{ color: "var(--ui-accent)" }}
          >
            <ChevronIcon dir="left" size={16} />
            Digestion
          </button>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {openSymptom}
          </h2>
        </div>
        <HealthCard caption={when}>
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl leading-tight font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {detail.now.days}
            </span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {detail.now.days === 1 ? "day" : "days"} of {detail.now.trackedDays}
            </span>
          </p>
          {change.detail && (
            <p className="text-xs" style={{ color: change.detailColor ?? "var(--text-secondary)" }}>
              {change.detail} the previous {daysBetween(range.start, range.end) + 1} days
            </p>
          )}
          <div className="mt-3 flex h-16 items-end gap-px" role="img" aria-label={`${openSymptom} on ${detail.now.days} of ${detail.now.trackedDays} days`}>
            {detail.bars.map((b) => (
              <span
                key={b.date}
                className="min-w-0 flex-1 rounded-[1px]"
                style={
                  b.value === null
                    ? { height: 0 }
                    : b.value > 0
                      ? { height: `${Math.max(20, (b.value / (maxBar || 1)) * 100)}%`, background: SYMPTOM_COLOR }
                      : { height: 3, background: "var(--gridline)" }
                }
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            <span>{dayLabel(range.start, today)}</span>
            <span>{dayLabel(range.end, today)}</span>
          </div>
        </HealthCard>
        <TrendGroup>
          <TrendRow label="Most often" value={detail.mostOften ?? "—"} />
          <TrendRow
            label="Last"
            value={
              detail.last
                ? `${dayLabel(detail.last.date, today)}${detail.last.at ? `, ${new Date(detail.last.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}`
                : "—"
            }
          />
        </TrendGroup>
      </div>
    );
  }

  const bandCount = (band: string) => bands.find((b) => b.band === band)?.count ?? 0;
  const shownSymptoms = showAllSymptoms ? symptoms : symptoms.slice(0, SYMPTOMS_SHOWN);
  const shownMovement = showAllMovement ? withMovement : withMovement.slice(0, MOVEMENT_ROWS_SHOWN);
  const trackedDays = symptomDays?.now.trackedDays ?? 0;
  const details = [
    colour && { label: "Colour", value: `Mostly ${colour.label.toLowerCase()}` },
    hygiene && { label: "Hygiene", value: `Mostly ${hygiene.label.toLowerCase()}` },
    toiletMinutes !== null && { label: "Time on the toilet", value: `${Math.round(toiletMinutes)} min average` },
  ].filter((d): d is { label: string; value: string } => !!d);

  return (
    <div className="flex flex-col gap-4">
      {filter}

      <HealthCard caption={`Bristol scale · ${when}`}>
        {dots.length > 0 ? (
          <>
            <BristolDotChart data={dots} start={range.start} end={range.end} />
            <div className="mt-3 grid grid-cols-3 border-t pt-2.5" style={{ borderColor: "var(--border-hairline)" }}>
              {BANDS.map((b) => (
                <div key={b.band} className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: b.color }}>
                    {b.label} <span className="font-normal">{b.range}</span>
                  </p>
                  <p className="text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {bandCount(b.band)}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No bowel movements logged in this range.
          </p>
        )}
      </HealthCard>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
      {movements && symptomDays && (
        <SplitStatCard
          items={[
            { caption: "Movements", value: String(movements.count), detail: movements.perDay !== null ? `${movements.perDay} a day` : undefined },
            trackedDays > 0
              ? { caption: "Symptom days", value: String(symptomDays.now.days), unit: `of ${trackedDays}`, ...changeDetail(symptomDays.now, symptomDays.before) }
              : { caption: "Symptom days", value: "—" },
          ]}
        />
      )}

      {symptoms.length > 0 && (
        <TrendGroup caption={`Digestive symptoms · ${when}`}>
          {shownSymptoms.map((s) => (
            <TrendRow
              key={s.item}
              label={s.item}
              value={`${s.daysCompleted} ${s.daysCompleted === 1 ? "day" : "days"}`}
              bar={{ pct: trackedDays > 0 ? (s.daysCompleted / trackedDays) * 100 : 0, color: SYMPTOM_COLOR }}
              onClick={() => openDetail(s.item)}
            />
          ))}
          {symptoms.length > SYMPTOMS_SHOWN && <ShowAllRow total={symptoms.length} expanded={showAllSymptoms} onToggle={() => setShowAllSymptoms((v) => !v)} />}
        </TrendGroup>
      )}

      </div>
      <div className="flex flex-col gap-4">
      {withMovement.length > 0 && (
        <TrendGroup caption="With bowel movements">
          {shownMovement.map((m) => (
            <TrendRow key={m.label} label={m.label} value={`${m.count} of ${m.total}`} />
          ))}
          {withMovement.length > MOVEMENT_ROWS_SHOWN && <ShowAllRow total={withMovement.length} expanded={showAllMovement} onToggle={() => setShowAllMovement((v) => !v)} />}
        </TrendGroup>
      )}

      {details.length > 0 && (
        <TrendGroup caption="Details">
          {details.map((d) => (
            <TrendRow key={d.label} label={d.label} value={d.value} />
          ))}
        </TrendGroup>
      )}
      </div>
      </div>
    </div>
  );
}
