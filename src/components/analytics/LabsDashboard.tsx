"use client";

import { useMemo, useState } from "react";
import { useLabs } from "@/lib/useLabs";
import { todayLocalISODate } from "@/lib/aggregations/common";
import {
  clipMarkers,
  flaggedReadings,
  headlineMarkers,
  labsSpan,
  normalizedSeries,
  rangeCutoff,
  rangeStatus,
  DEFAULT_LAB_PINS,
  LAB_RANGES,
  type HeadlineMarker,
  type LabRangeOption,
} from "@/lib/aggregations/labs";
import type { LabMarker } from "@/lib/supabase/labs";
import { useVitals } from "@/lib/useVitals";
import type { BloodPressureReading, WeightReading } from "@/lib/supabase/vitals";
import { bpCategory, bpElevated } from "@/lib/aggregations/vitals";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Methodology } from "@/components/ui/Methodology";
import { SearchField } from "@/components/ui/SearchField";
import { LabMarkerChart, LabMiniChart, LabSparkline } from "@/components/charts/LabMarkerChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";

const ACCENT = "var(--series-6)";
const MAX_COMPARE = 4;
const COMPARE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-4)", "var(--series-berry)"];

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtValue(v: number, unit: string | null): string {
  return unit ? `${v} ${unit}` : String(v);
}

function statusWord(status: HeadlineMarker["status"]): string {
  if (status === "low") return "below range";
  if (status === "high") return "above range";
  if (status === "in") return "in range";
  return "no range set";
}

function statusTone(status: HeadlineMarker["status"]): string {
  if (status === "low" || status === "high") return "var(--status-warning)";
  if (status === "in") return "var(--status-good)";
  return "var(--text-muted)";
}

export function LabsDashboard() {
  const labs = useLabs();
  const vitals = useVitals();
  const [rangeId, setRangeId] = useState<LabRangeOption["id"]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareQuery, setCompareQuery] = useState("");

  const today = todayLocalISODate();
  const rangeOption = LAB_RANGES.find((r) => r.id === rangeId) ?? LAB_RANGES[0];

  const allMarkers = labs.markers.data;
  const span = useMemo(() => labsSpan(allMarkers), [allMarkers]);
  const inRange = useMemo(
    () => clipMarkers(allMarkers, rangeCutoff(rangeOption, today)),
    [allMarkers, rangeOption, today],
  );
  const headline = useMemo(() => headlineMarkers(inRange, DEFAULT_LAB_PINS), [inRange]);
  const flagged = useMemo(() => flaggedReadings(inRange), [inRange]);

  const cutoff = rangeCutoff(rangeOption, today);
  // Newest first (useVitals sorts that way); clipped to the range control.
  const bpShown = useMemo(
    () => (cutoff ? vitals.bp.data.filter((r) => r.measuredAt >= cutoff) : vitals.bp.data),
    [vitals.bp.data, cutoff],
  );
  const weightShown = useMemo(
    () => (cutoff ? vitals.weight.data.filter((r) => r.measuredAt >= cutoff) : vitals.weight.data),
    [vitals.weight.data, cutoff],
  );
  const hasVitals = vitals.bp.data.length > 0 || vitals.weight.data.length > 0;

  const panelSections = useMemo(() => {
    const byPanel = new Map<string, LabMarker[]>();
    for (const m of inRange) {
      const key = m.panelId ?? "";
      byPanel.set(key, [...(byPanel.get(key) ?? []), m]);
    }
    const sections = labs.panels.data
      .map((p) => ({ id: p.id, name: p.name, icon: p.icon, color: p.color, markers: byPanel.get(p.id) ?? [] }))
      .filter((s) => s.markers.length > 0);
    const other = byPanel.get("") ?? [];
    if (other.length > 0) sections.push({ id: "__other__", name: sections.length > 0 ? "Other" : "Markers", icon: null, color: null, markers: other });
    return sections;
  }, [inRange, labs.panels.data]);

  const compareMarkers = useMemo(
    () => compare.map((id) => inRange.find((m) => m.id === id)).filter((m): m is LabMarker => !!m),
    [compare, inRange],
  );
  const compareSeries = useMemo(
    () => (compareMarkers.length >= 2 ? normalizedSeries(compareMarkers) : null),
    [compareMarkers],
  );

  const compareOptions = useMemo(() => {
    const q = compareQuery.trim().toLowerCase();
    return inRange
      .filter((m) => m.results.length >= 2 && (!q || m.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inRange, compareQuery]);

  if (labs.loading) return <PageSkeleton />;
  if (labs.error) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
        Couldn&apos;t load your results — try again in a moment.
      </p>
    );
  }
  if (allMarkers.length === 0) {
    return (
      <EmptyState
        title="No blood results yet"
        description="Add markers and values on the Medical → Results tab and this dashboard fills in."
        showLogLink={false}
      />
    );
  }

  function toggleCompare(id: string) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]));
  }

  const yearSpan = span ? `${span.start.slice(0, 4)}–${span.end.slice(0, 4)}` : null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <DashboardHeader
        accent={ACCENT}
        className="lg:col-span-2"
        subtitle={[`${allMarkers.length} markers`, yearSpan].filter(Boolean).join(" · ")}
      >
        Blood
      </DashboardHeader>

      <div className="flex flex-wrap gap-1.5 lg:col-span-2">
        {LAB_RANGES.map((r) => {
          const active = r.id === rangeId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              aria-pressed={active}
              className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                borderColor: active ? ACCENT : "var(--border-hairline)",
                background: active ? `color-mix(in oklab, ${ACCENT} 14%, var(--surface-1))` : "transparent",
                color: active ? ACCENT : "var(--text-muted)",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {headline.length > 0 && (
        <div className="lg:col-span-2">
          <p className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Headline markers
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {headline.map((h) => (
              <Card key={h.id} tier="raw" className="flex flex-col gap-1.5">
                <p className="truncate text-xs font-medium" style={{ color: "var(--text-secondary)" }} title={h.name}>
                  {h.name}
                </p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: statusTone(h.status) }}>
                  {h.latest != null ? fmtValue(h.latest, h.unit) : "—"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {statusWord(h.status)}
                  {h.deltaPct != null && Math.abs(h.deltaPct) >= 1 && (
                    <>
                      {" · "}
                      {h.deltaPct > 0 ? "▲" : "▼"} {Math.abs(Math.round(h.deltaPct))}%
                    </>
                  )}
                </p>
                {h.spark.length >= 2 && (
                  <div className="mt-0.5">
                    <LabSparkline values={h.spark} refLow={null} refHigh={null} width={96} height={22} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {hasVitals && <VitalsBlock bp={bpShown} weight={weightShown} />}

      <Card tier="raw" className="lg:col-span-2">
        <CardTitle size="sm" subtitle="Markers whose most recent value sits outside its reference range">
          Flagged
        </CardTitle>
        {flagged.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing out of range in this window.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
            {flagged.map((f) => {
              const bound = f.status === "low" ? f.refLow : f.refHigh;
              return (
                <li key={f.markerId} className="flex items-center gap-3 py-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--status-warning)" }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {f.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--status-warning)" }}>
                    {fmtValue(f.value, f.unit)}
                  </span>
                  <span className="hidden shrink-0 text-xs tabular-nums sm:inline" style={{ color: "var(--text-muted)" }}>
                    {f.status === "low" ? "below" : "above"} {bound} · {fmtDate(f.measuredOn)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-sm font-semibold lg:col-span-2" style={{ color: "var(--text-primary)" }}>
        By panel
      </p>

      {panelSections.map((s) => {
        const expandedMarker = s.markers.find((m) => m.id === expanded);
        return (
          <Card key={s.id} tier="raw" className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-1.5">
              {s.icon && (
                <span style={{ color: customColorValue(s.color) ?? ACCENT }}>
                  <CustomIcon icon={s.icon} size={15} />
                </span>
              )}
              <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{s.name}</h3>
            </div>
            {expandedMarker ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setExpanded(null)}
                  className="self-start text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  ← Back to {s.name}
                </button>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {expandedMarker.name}
                  {expandedMarker.unit && (
                    <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>({expandedMarker.unit})</span>
                  )}
                </p>
                <LabMarkerChart
                  data={expandedMarker.results.map((r) => ({ date: r.measuredOn, value: r.value }))}
                  unit={expandedMarker.unit}
                  refLow={expandedMarker.refLow}
                  refHigh={expandedMarker.refHigh}
                  color={ACCENT}
                />
                <ul className="flex flex-col divide-y text-sm" style={{ borderColor: "var(--gridline)" }}>
                  {[...expandedMarker.results].reverse().slice(0, 12).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtValue(r.value, expandedMarker.unit)}</span>
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtDate(r.measuredOn)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                {s.markers.map((m) => {
                  const sorted = [...m.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
                  const latest = sorted[sorted.length - 1];
                  const status = latest ? rangeStatus(latest.value, m.refLow, m.refHigh) : null;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setExpanded(m.id)}
                      className="flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors hover:bg-[var(--page-plane)]"
                      style={{ borderColor: "var(--gridline)" }}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</span>
                        <span className="shrink-0 text-xs tabular-nums" style={{ color: statusTone(status) }}>
                          {latest ? fmtValue(latest.value, m.unit) : "—"}
                        </span>
                      </span>
                      <LabMiniChart
                        points={sorted.map((r) => ({ measuredOn: r.measuredOn, value: r.value }))}
                        refLow={m.refLow}
                        refHigh={m.refHigh}
                        status={status}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      <Card tier="raw" className="lg:col-span-2">
        <CardTitle size="sm" subtitle={`Pick 2–${MAX_COMPARE} markers to overlay on one normalized scale`}>
          Compare
        </CardTitle>
        <div className="flex flex-col gap-3">
          <SearchField value={compareQuery} onChange={setCompareQuery} placeholder="Find a marker" className="w-full" />
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {compareOptions.map((m) => {
              const on = compare.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleCompare(m.id)}
                  aria-pressed={on}
                  disabled={!on && compare.length >= MAX_COMPARE}
                  className="rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40"
                  style={{
                    borderColor: on ? ACCENT : "var(--border-hairline)",
                    background: on ? `color-mix(in oklab, ${ACCENT} 14%, var(--surface-1))` : "transparent",
                    color: on ? ACCENT : "var(--text-muted)",
                  }}
                >
                  {m.name}
                </button>
              );
            })}
            {compareOptions.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>No markers with two or more values here.</p>
            )}
          </div>
          {compareSeries && compareSeries.data.length >= 2 ? (
            <>
              <MultiLineChart
                data={compareSeries.data}
                series={compareMarkers.map((m, i) => ({ key: m.id, label: m.name, color: COMPARE_COLORS[i % COMPARE_COLORS.length] }))}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {compareSeries.note === "midpoint"
                  ? "Each line is a percent of that marker's reference midpoint (100% = mid-range)."
                  : compareSeries.note === "minmax"
                    ? "Markers without a reference range are scaled 0–100 across their own history."
                    : "Markers with a reference range show as a percent of its midpoint; those without are scaled 0–100 across their own history."}
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Select at least two markers.</p>
          )}
        </div>
      </Card>

      <Methodology className="lg:col-span-2">
        This dashboard only describes your own recorded results. A value is &quot;out of range&quot; when it falls
        outside the reference low/high stored on that marker — those ranges are lab- and sometimes age-specific, so
        treat a flag as a prompt to look, not a diagnosis. Change vs previous compares the latest value with the one
        before it. The compare chart puts unrelated markers on one scale so their shapes can be read together; the
        numbers on its axis are not clinically meaningful. Blood-pressure categories are the ACC/AHA 2017 bands,
        shown for reference.
      </Methodology>
    </div>
  );
}

function VitalsBlock({ bp, weight }: { bp: BloodPressureReading[]; weight: WeightReading[] }) {
  const latestBp = bp[0] ?? null;
  const bpCat = latestBp ? bpCategory(latestBp.systolic, latestBp.diastolic) : null;
  const latestWeight = weight[0] ?? null;
  const weightDelta =
    weight.length >= 2 ? Math.round((weight[0].kg - weight[weight.length - 1].kg) * 10) / 10 : null;
  const anyElevated = bp.some((r) => bpElevated(r.systolic, r.diastolic));

  return (
    <Card tier="raw" className="lg:col-span-2">
      <CardTitle size="sm" subtitle="Blood pressure and weight from the Medical → Vitals tab">
        Vitals
      </CardTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {latestBp && bpCat && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Blood pressure</p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: bpCat.color }}>
              {latestBp.systolic}/{latestBp.diastolic}
              <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>mmHg</span>
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {bpCat.label} · {fmtDate(latestBp.measuredAt.slice(0, 10))}
            </p>
            {bp.length >= 2 && (
              <div className="mt-0.5">
                <LabSparkline values={[...bp].reverse().map((r) => r.systolic)} refLow={null} refHigh={null} width={112} height={24} />
              </div>
            )}
          </div>
        )}
        {latestWeight && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Weight</p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {latestWeight.kg}
              <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>kg</span>
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {weightDelta != null && weightDelta !== 0 ? `${weightDelta > 0 ? "+" : ""}${weightDelta} kg over this range · ` : ""}
              {fmtDate(latestWeight.measuredAt.slice(0, 10))}
            </p>
            {weight.length >= 2 && (
              <div className="mt-0.5">
                <LabSparkline values={[...weight].reverse().map((r) => r.kg)} refLow={null} refHigh={null} width={112} height={24} />
              </div>
            )}
          </div>
        )}
      </div>
      {anyElevated && (
        <p className="mt-3 text-xs" style={{ color: "var(--status-warning)" }}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--status-warning)" }} aria-hidden="true" />
          Some blood-pressure readings in this range are Stage 1 or higher.
        </p>
      )}
    </Card>
  );
}
