"use client";

import { useMemo, useState } from "react";
import { useLabs } from "@/lib/useLabs";
import { todayLocalISODate } from "@/lib/aggregations/common";
import {
  clipMarkers,
  effectiveRange,
  flaggedReadings,
  headlineMarkers,
  labsSpan,
  normalizedSeries,
  rangeBar,
  rangeCutoff,
  rangeStatus,
  DEFAULT_LAB_PINS,
  LAB_RANGES,
  type HeadlineMarker,
  type LabRangeOption,
} from "@/lib/aggregations/labs";
import { optimalStatusColor } from "./labStatus";
import type { LabMarker } from "@/lib/supabase/labs";
import { useVitals } from "@/lib/useVitals";
import type { BloodPressureReading, WeightReading } from "@/lib/supabase/vitals";
import { bpCategory, bpElevated } from "@/lib/aggregations/vitals";
import { InlineEmpty, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Card, CardTitle } from "@/components/ui/Card";
import { Methodology } from "@/components/ui/Methodology";
import { SearchField } from "@/components/ui/SearchField";
import { LabMarkerChart, LabSparkline } from "@/components/charts/LabMarkerChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";

const ACCENT = "var(--series-1)";
const MAX_COMPARE = 4;
const COMPARE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-4)", "var(--series-berry)"];

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtValue(v: number, unit: string | null): string {
  return unit ? `${v} ${unit}` : String(v);
}

/** Trim the padding artefacts off a widened track end (2.749999 → 2.7). */
function fmtNum(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

type Basis = "optimal" | "reference" | null;

function statusWord(status: HeadlineMarker["status"], basis: Basis): string {
  const band = basis === "optimal" ? "optimal" : "norm";
  if (status === "low") return `below ${band}`;
  if (status === "high") return `above ${band}`;
  if (status === "in") return basis === "optimal" ? "optimal" : "in norm";
  return "no range set";
}

/** The label for the highlighted band under the bar. */
function bandLabel(basis: Basis, low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  const noun = basis === "optimal" ? "optimal" : "norm";
  if (low != null && high != null) return `${noun} ${fmtNum(low)}–${fmtNum(high)}`;
  if (low != null) return `${noun} ≥ ${fmtNum(low)}`;
  return `${noun} ≤ ${fmtNum(high as number)}`;
}

function statusTone(status: HeadlineMarker["status"]): string {
  return optimalStatusColor(status);
}

/** The read/analysis view of the Health → Results tab — flagged-first,
 * per-panel small-multiples, and a normalized compare overlay. Was the
 * Analytics "Blood" dashboard; folded in here so lab data lives in one
 * place. The Results tab's Manage view does the CRUD. */
export function LabsOverview({ onManage }: { onManage?: () => void }) {
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

  if (labs.loading) return <ListSkeleton />;
  if (labs.error) {
    return <ErrorState what="your results" />;
  }
  if (allMarkers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <InlineEmpty
          title="No blood results yet"
          description="Add a marker (TSH, Ferritin, …) with its unit and reference range, then log values as you get them — the trend builds up over time."
        />
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: ACCENT, background: `color-mix(in oklab, ${ACCENT} 12%, var(--surface-1))`, color: ACCENT }}
          >
            Add a marker
          </button>
        )}
      </div>
    );
  }

  function toggleCompare(id: string) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]));
  }

  const yearSpan = span ? `${span.start.slice(0, 4)}–${span.end.slice(0, 4)}` : null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <p className="text-xs lg:col-span-2" style={{ color: "var(--text-muted)" }}>
        {[`${allMarkers.length} markers`, yearSpan].filter(Boolean).join(" · ")}
      </p>

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
                  {statusWord(h.status, h.basis)}
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
        <CardTitle size="sm" subtitle="Markers whose most recent value sits outside its optimal range — or the lab reference range where no optimal one is set">
          Flagged
        </CardTitle>
        {flagged.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing outside range in this window.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
            {flagged.map((f) => {
              const bound = f.status === "low" ? f.low : f.high;
              return (
                <li key={f.markerId} className="flex items-center gap-3 py-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--status-critical)" }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {f.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--status-critical)" }}>
                    {fmtValue(f.value, f.unit)}
                  </span>
                  <span className="hidden shrink-0 text-xs tabular-nums sm:inline" style={{ color: "var(--text-muted)" }}>
                    {f.status === "low" ? "below" : "above"} {bound != null ? fmtNum(bound) : ""} {f.basis === "optimal" ? "optimal" : "norm"} · {fmtDate(f.measuredOn)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex flex-col gap-2.5 lg:col-span-2">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          By panel
        </p>

        {panelSections.map((s) => {
          const expandedMarker = s.markers.find((m) => m.id === expanded);
          return (
            <Card key={s.id} tier="raw" padded={false} className="px-3.5 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5">
                {s.icon && (
                  <span style={{ color: customColorValue(s.color) ?? ACCENT }}>
                    <CustomIcon icon={s.icon} size={13} />
                  </span>
                )}
                <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {s.name}
                </h3>
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
                <div className="flex flex-col">
                  {s.markers.map((m, i) => (
                    <MarkerRangeRow
                      key={m.id}
                      marker={m}
                      last={i === s.markers.length - 1}
                      onOpen={() => setExpanded(m.id)}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

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
        This dashboard only describes your own recorded results. Each value is read against its optimal range where
        you&rsquo;ve set one, otherwise the lab reference low/high on that marker — both are lab- and sometimes
        age-specific, so treat a flag as a prompt to look, not a diagnosis. The bar under each value shows where it
        sits between the reference low and high, with the optimal band highlighted. Change vs previous compares the
        latest value with the one before it. The compare chart puts unrelated markers on one scale so their shapes
        can be read together; the numbers on its axis are not clinically meaningful. Blood-pressure categories are
        the ACC/AHA 2017 bands, shown for reference.
      </Methodology>
    </div>
  );
}

/** One marker in a panel card: a compact data block (name + value), a
 * horizontal range bar carrying reference range + optimal band + the
 * reading, and the status word. Tap to expand the marker's trend chart. */
function MarkerRangeRow({ marker, last, onOpen }: { marker: LabMarker; last: boolean; onOpen: () => void }) {
  const sorted = [...marker.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const latest = sorted[sorted.length - 1] ?? null;
  const { low, high, basis } = effectiveRange(marker);
  const status = latest ? rangeStatus(latest.value, low, high) : null;
  const bar = latest ? rangeBar(latest.value, marker.refLow, marker.refHigh, marker.optimalLow, marker.optimalHigh) : null;
  const tone = optimalStatusColor(status);
  const label = bandLabel(basis, low, high);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full items-center gap-3 py-2 text-left"
      style={{
        gridTemplateColumns: "4.5rem minmax(0,1fr) 3.25rem",
        borderBottom: last ? undefined : "1px solid var(--border-hairline)",
      }}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          {marker.name}
        </span>
        <span
          className="block text-xs font-semibold tabular-nums"
          style={{ color: latest && status ? tone : "var(--text-primary)" }}
        >
          {latest ? fmtNum(latest.value) : "—"}
          {marker.unit && (
            <span className="ml-0.5 text-[9px] font-normal" style={{ color: "var(--text-muted)" }}>{marker.unit}</span>
          )}
        </span>
      </span>

      {bar ? (
        <span className="relative block h-[26px]">
          <span
            className="absolute inset-x-0 top-[5px] block h-[5px] rounded-full"
            style={{ background: "color-mix(in oklab, var(--gridline) 65%, var(--surface-1))" }}
          />
          <span
            className="absolute top-[3px] block h-[9px] rounded-full"
            style={{
              left: `${bar.bandLeftPct}%`,
              width: `${Math.max(bar.bandRightPct - bar.bandLeftPct, 2)}%`,
              background: "color-mix(in oklab, var(--status-good) 22%, var(--gridline))",
            }}
          />
          <span
            className="absolute top-[1.5px] block h-[11px] w-[11px] rounded-full"
            style={{ left: `calc(${bar.valuePct}% - 5.5px)`, background: tone, boxShadow: "0 0 0 2.5px var(--surface-1)" }}
          />
          <span
            className={`absolute inset-x-0 top-[15px] flex items-center gap-1 text-[9px] tabular-nums ${bar.bandInsideTrack ? "justify-between" : "justify-center"}`}
            style={{ color: "var(--text-muted)" }}
          >
            {bar.bandInsideTrack && <span>{fmtNum(bar.trackLow)}</span>}
            {label && (
              <span className="truncate" style={{ color: "color-mix(in oklab, var(--status-good) 70%, var(--text-muted))" }}>
                {label}
              </span>
            )}
            {bar.bandInsideTrack && <span>{fmtNum(bar.trackHigh)}</span>}
          </span>
        </span>
      ) : (
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>No range set</span>
      )}

      <span className="text-right text-[9.5px] leading-tight" style={{ color: tone }}>
        {latest && basis ? statusWord(status, basis) : ""}
      </span>
    </button>
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
      <CardTitle size="sm" subtitle="Blood pressure and weight from the Health → Vitals tab">
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
