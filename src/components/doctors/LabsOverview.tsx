"use client";

import { useState, type ReactNode } from "react";
import type { useLabs } from "@/lib/useLabs";
import { formatDMY, todayLocalISODate } from "@/lib/aggregations/common";
import {
  clipMarkers,
  effectiveRange,
  labsSpan,
  rangeBar,
  rangeCutoff,
  rangeStatus,
  summariseWindow,
  LAB_RANGES,
  type LabRangeOption,
  type RangeStatus,
} from "@/lib/aggregations/labs";
import { optimalStatusColor } from "./labStatus";
import { IconAction, PencilIcon } from "./shared";
import { Button } from "@/components/ui/Button";
import type { LabMarker, LabResult } from "@/lib/supabase/labs";
import { InlineEmpty, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";
import { Methodology } from "@/components/ui/Methodology";
import { LabMarkerChart } from "@/components/charts/LabMarkerChart";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";
import { Segmented } from "@/components/ui/Segmented";

const ACCENT = "var(--ui-accent)";

type Mode = "average" | "last";
type SortKey = "panel" | "name";
type Basis = "optimal" | "reference" | null;

/** Trim padding artefacts off a widened track end (2.749999 → 2.7). */
function fmtNum(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmtValue(v: number, unit: string | null): string {
  return unit ? `${fmtNum(v)} ${unit}` : fmtNum(v);
}

function statusWord(status: RangeStatus, basis: Basis): string {
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

function windowWord(option: LabRangeOption): string {
  return option.years ? `${option.years} year${option.years > 1 ? "s" : ""}` : "all-time";
}

/** The read/analysis view of Health → Results: the panel list — every
 * marker on its reference-range bar with the optimal band marked — grouped
 * by panel or flat A–Z, with a time-window control that switches each row
 * between the window average (spread shown as a whisker) and the latest
 * reading. Tapping a marker opens its trend, window stats and full history,
 * plus add/edit for its values. Marker and panel config lives in Settings. */
export function LabsOverview({
  labs,
  actions,
  secondaryActions,
  onNewMarker,
  onAddValue,
  onEditValue,
}: {
  labs: ReturnType<typeof useLabs>;
  /** Right-aligned control shown beside the time-window switch — the one
   * primary action (New marker), so it never competes with the window
   * control for the row's width. */
  actions?: ReactNode;
  /** Right-aligned control(s) shown beside the mode/sort switches instead —
   * for a secondary action (Add results) that doesn't need to be in the
   * first row. */
  secondaryActions?: ReactNode;
  onNewMarker?: () => void;
  onAddValue?: (markerId: string) => void;
  onEditValue?: (markerId: string, result: LabResult) => void;
}) {
  const [rangeId, setRangeId] = useState<LabRangeOption["id"]>("all");
  const [mode, setMode] = useState<Mode>("last");
  const [sort, setSort] = useState<SortKey>("panel");
  const [panelFilter, setPanelFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const today = todayLocalISODate();
  const rangeOption = LAB_RANGES.find((r) => r.id === rangeId) ?? LAB_RANGES[0];
  const cutoff = rangeCutoff(rangeOption, today);

  const allMarkers = labs.markers.data;
  const span = labsSpan(allMarkers);
  const inRange = clipMarkers(allMarkers, cutoff);

  const panelNameById = new Map(labs.panels.data.map((p) => [p.id, p.name] as const));
  const panelName = (m: LabMarker) => (m.panelId ? panelNameById.get(m.panelId) ?? null : null);

  const panelSections = (() => {
    const byPanel = new Map<string, LabMarker[]>();
    for (const m of inRange) {
      const key = m.panelId ?? "";
      byPanel.set(key, [...(byPanel.get(key) ?? []), m]);
    }
    const sections = labs.panels.data
      .map((p) => ({ id: p.id, name: p.name, icon: p.icon, color: p.color, markers: byPanel.get(p.id) ?? [] }))
      .filter((s) => s.markers.length > 0);
    const other = byPanel.get("") ?? [];
    if (other.length > 0)
      sections.push({ id: "__other__", name: sections.length > 0 ? "Other" : "Markers", icon: null, color: null, markers: other });
    return sections;
  })();

  // A panel filter that no longer matches anything in the current window
  // falls back to "all" rather than showing an empty list.
  const effectiveFilter = panelFilter && panelSections.some((s) => s.id === panelFilter) ? panelFilter : null;
  const inFilter = (m: LabMarker) => (effectiveFilter === "__other__" ? !m.panelId : m.panelId === effectiveFilter);
  const shownSections = effectiveFilter ? panelSections.filter((s) => s.id === effectiveFilter) : panelSections;
  const flatMarkers = [...inRange]
    .filter((m) => !effectiveFilter || inFilter(m))
    .sort((a, b) => a.name.localeCompare(b.name));
  const shownCount = effectiveFilter ? shownSections.reduce((n, s) => n + s.markers.length, 0) : allMarkers.length;

  if (labs.loading) return <ListSkeleton />;
  if (labs.error) return <ErrorState what="your results" />;

  if (allMarkers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <InlineEmpty
          title="No blood results yet"
          description="Add a marker (TSH, Ferritin, …) with its unit and reference range, then log values as you get them — the trend builds up over time."
        />
        {onNewMarker && (
          <button
            type="button"
            onClick={onNewMarker}
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: ACCENT, background: `color-mix(in oklab, ${ACCENT} 12%, var(--surface-1))`, color: ACCENT }}
          >
            Add a marker
          </button>
        )}
      </div>
    );
  }

  const windowStart = cutoff ?? span?.start ?? today;
  const openMarker = openId ? inRange.find((m) => m.id === openId) ?? null : null;

  if (openMarker) {
    return (
      <MarkerDetailView
        marker={openMarker}
        rangeOption={rangeOption}
        rangeId={rangeId}
        onRangeChange={setRangeId}
        windowStart={windowStart}
        windowEnd={today}
        onBack={() => setOpenId(null)}
        onAddValue={onAddValue ? () => onAddValue(openMarker.id) : undefined}
        onEditValue={onEditValue ? (r) => onEditValue(openMarker.id, r) : undefined}
      />
    );
  }

  const yearSpan = span ? `${span.start.slice(0, 4)}–${span.end.slice(0, 4)}` : null;
  const win = windowWord(rangeOption);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={rangeId} onChange={setRangeId} accent={ACCENT} options={LAB_RANGES.map((r) => [r.id, r.label] as const)} />
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={mode}
            onChange={setMode}
            accent={ACCENT}
            options={
              [
                ["average", "Average"],
                ["last", "Last"],
              ] as const
            }
          />
          <Segmented
            value={sort}
            onChange={setSort}
            accent={ACCENT}
            options={
              [
                ["panel", "Panel"],
                ["name", "A–Z"],
              ] as const
            }
          />
          {secondaryActions && <div className="ml-auto flex items-center gap-2">{secondaryActions}</div>}
        </div>
      </div>

      {panelSections.length >= 2 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <FilterChip label="All panels" active={!effectiveFilter} onClick={() => setPanelFilter(null)} />
          {panelSections.map((s) => (
            <FilterChip
              key={s.id}
              label={s.name}
              active={effectiveFilter === s.id}
              onClick={() => setPanelFilter(effectiveFilter === s.id ? null : s.id)}
            />
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {mode === "average"
          ? `Each bar is the mean of every reading ${cutoff ? `in the last ${win}` : "on record"} — the whisker is its lowest-to-highest spread.`
          : `Each bar is the most recent reading${cutoff ? ` in the last ${win}` : ""}.`}
        {` · ${shownCount} marker${shownCount === 1 ? "" : "s"}${yearSpan ? ` · ${yearSpan}` : ""}`}
      </p>

      {sort === "panel" ? (
        <div className="flex flex-col gap-2.5">
          {shownSections.map((s) => (
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
              <div className="flex flex-col">
                {s.markers.map((m, i) => (
                  <MarkerRow key={m.id} marker={m} mode={mode} last={i === s.markers.length - 1} onOpen={() => setOpenId(m.id)} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card tier="raw" padded={false} className="px-3.5">
          <div className="flex flex-col">
            {flatMarkers.map((m, i) => (
              <MarkerRow
                key={m.id}
                marker={m}
                mode={mode}
                subPrefix={panelName(m)}
                last={i === flatMarkers.length - 1}
                onOpen={() => setOpenId(m.id)}
              />
            ))}
          </div>
        </Card>
      )}

      <Methodology>
        This view only describes your own recorded results. Pick a time window at the top: <strong>Average</strong> reads the
        mean of every draw in it (the whisker on the bar is the lowest-to-highest spread), <strong>Last</strong> shows only the
        most recent draw. Each value is read against your optimal range where you&rsquo;ve set one, otherwise the lab reference
        low/high — both are lab- and sometimes age-specific, so treat a flag as a prompt to look, not a diagnosis. The bar marks
        where the value sits, with the optimal band in green and the scale ends labelled. Open a marker for its full trend and
        history.
      </Methodology>
    </div>
  );
}

// --- Controls -----------------------------------------------------

/** One pill in the panel filter row — same accent treatment as `Segmented`,
 * but standalone so the row can scroll sideways on a narrow screen. */
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? ACCENT : "var(--border-hairline)",
        background: active ? `color-mix(in oklab, ${ACCENT} 14%, var(--surface-1))` : "var(--surface-1)",
        color: active ? ACCENT : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

// --- Row -----------------------------------------------------------

/** One marker: a compact name + value block, the horizontal range bar
 * (reference track + optimal band + the reading, plus a spread whisker in
 * Average mode) and the status word. Tap to open the marker. */
function MarkerRow({
  marker,
  mode,
  last,
  subPrefix,
  onOpen,
}: {
  marker: LabMarker;
  mode: Mode;
  last: boolean;
  /** Panel name shown before the sub-label when the list is flat A–Z. */
  subPrefix?: string | null;
  onOpen: () => void;
}) {
  const summary = summariseWindow(marker.results);
  const { low, high, basis } = effectiveRange(marker);
  const reading = summary ? (mode === "average" ? summary.mean : summary.latest) : null;
  const status = reading != null ? rangeStatus(reading, low, high) : null;
  const tone = optimalStatusColor(status);
  const bar = reading != null ? rangeBar(reading, marker.refLow, marker.refHigh, marker.optimalLow, marker.optimalHigh) : null;
  const label = bandLabel(basis, low, high);

  const track = bar ? bar.trackHigh - bar.trackLow : 0;
  const pctOf = (v: number) => (track > 0 ? Math.max(0, Math.min(100, ((v - bar!.trackLow) / track) * 100)) : 0);
  const showWhisker = mode === "average" && !!bar && !!summary && summary.count >= 2 && summary.max > summary.min;
  const wLeft = showWhisker ? pctOf(summary!.min) : 0;
  const wRight = showWhisker ? pctOf(summary!.max) : 0;

  const sub =
    summary == null ? "—" : mode === "average" ? `avg ×${summary.count}` : formatDMY(summary.latestOn);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full items-center gap-3 py-2 text-left"
      style={{
        gridTemplateColumns: "4.75rem minmax(0,1fr) 3rem",
        borderBottom: last ? undefined : "1px solid var(--border-hairline)",
      }}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          {marker.name}
        </span>
        <span
          className="block text-xs font-semibold tabular-nums"
          style={{ color: reading != null && status ? tone : "var(--text-primary)" }}
        >
          {reading != null ? fmtNum(reading) : "—"}
          {marker.unit && (
            <span className="ml-0.5 text-[9px] font-normal" style={{ color: "var(--text-muted)" }}>
              {marker.unit}
            </span>
          )}
        </span>
        <span className="block text-[9px] leading-tight tabular-nums" style={{ color: "var(--text-muted)" }}>
          {subPrefix ? `${subPrefix} · ${sub}` : sub}
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
          {showWhisker && (
            <span
              className="absolute top-[7px] block h-[2px] rounded-full"
              style={{
                left: `${wLeft}%`,
                width: `${Math.max(wRight - wLeft, 1)}%`,
                background: "color-mix(in oklab, var(--text-secondary) 60%, transparent)",
              }}
            />
          )}
          <span
            className="absolute top-[1.5px] block h-[11px] w-[11px] rounded-full"
            style={{ left: `calc(${bar.valuePct}% - 5.5px)`, background: tone, boxShadow: "0 0 0 2.5px var(--surface-1)" }}
          />
          <span
            className="absolute inset-x-0 top-[15px] flex items-center justify-between gap-1 text-[9px] tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{fmtNum(bar.trackLow)}</span>
            {label && (
              <span className="truncate" style={{ color: "color-mix(in oklab, var(--status-good) 70%, var(--text-muted))" }}>
                {label}
              </span>
            )}
            <span>{fmtNum(bar.trackHigh)}</span>
          </span>
        </span>
      ) : (
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          No range set
        </span>
      )}

      <span className="text-right text-[9.5px] leading-tight" style={{ color: tone }}>
        {reading != null && basis ? statusWord(status, basis) : ""}
      </span>
    </button>
  );
}

// --- Detail ------------------------------------------------------

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        {k}
      </div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: tone ?? "var(--text-primary)" }}>
        {v}
      </div>
    </div>
  );
}

function MarkerDetailView({
  marker,
  rangeOption,
  rangeId,
  onRangeChange,
  windowStart,
  windowEnd,
  onBack,
  onAddValue,
  onEditValue,
}: {
  marker: LabMarker;
  rangeOption: LabRangeOption;
  rangeId: LabRangeOption["id"];
  onRangeChange: (v: LabRangeOption["id"]) => void;
  windowStart: string;
  windowEnd: string;
  onBack: () => void;
  onAddValue?: () => void;
  onEditValue?: (result: LabResult) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const ascending = [...marker.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const newest = [...ascending].reverse();
  const summary = summariseWindow(marker.results);
  const { low, high } = effectiveRange(marker);
  const status = summary ? rangeStatus(summary.latest, low, high) : null;
  const tone = optimalStatusColor(status);
  const deltaPct =
    summary && summary.previous != null && summary.previous !== 0
      ? ((summary.latest - summary.previous) / Math.abs(summary.previous)) * 100
      : null;

  const win = windowWord(rangeOption);
  const winCap = win.charAt(0).toUpperCase() + win.slice(1);

  const refLabel =
    marker.refLow != null || marker.refHigh != null
      ? `range ${fmtNum(marker.refLow ?? 0)}–${marker.refHigh != null ? fmtNum(marker.refHigh) : "∞"}`
      : null;
  const optLabel =
    marker.optimalLow != null || marker.optimalHigh != null
      ? `optimal ${marker.optimalLow != null ? fmtNum(marker.optimalLow) : "0"}–${
          marker.optimalHigh != null ? fmtNum(marker.optimalHigh) : "∞"
        }`
      : null;
  const n = summary?.count ?? 0;
  const drawWord = `${n} draw${n === 1 ? "" : "s"}${win === "all-time" ? "" : ` in the last ${win}`}`;

  const shown = showAll ? newest : newest.slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          ← All results
        </button>
        <Segmented value={rangeId} onChange={onRangeChange} accent={ACCENT} options={LAB_RANGES.map((r) => [r.id, r.label] as const)} />
      </div>

      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {marker.name}
          {marker.unit && (
            <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
              {marker.unit}
            </span>
          )}
        </h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {[refLabel, optLabel, drawWord].filter(Boolean).join(" · ")}
        </p>
      </div>

      {ascending.length >= 2 ? (
        <Card tier="raw" className="p-3">
          <LabMarkerChart
            data={ascending.map((r) => ({ date: r.measuredOn, value: r.value }))}
            unit={marker.unit}
            refLow={marker.refLow}
            refHigh={marker.refHigh}
            optimalLow={marker.optimalLow}
            optimalHigh={marker.optimalHigh}
            windowStart={windowStart}
            windowEnd={windowEnd}
            endColor={tone}
          />
        </Card>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Add a second value in this window to see the trend.
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-3">
          <Stat k={`Latest · ${formatDMY(summary.latestOn)}`} v={fmtNum(summary.latest)} tone={tone} />
          <Stat k="Previous" v={summary.previous != null ? fmtNum(summary.previous) : "—"} />
          <Stat
            k="Change"
            v={
              deltaPct == null
                ? "—"
                : `${deltaPct > 0 ? "▲ " : deltaPct < 0 ? "▼ " : ""}${Math.abs(Math.round(deltaPct))}%`
            }
            tone={deltaPct != null && status && status !== "in" ? tone : undefined}
          />
          <Stat k={`${winCap} average`} v={fmtNum(summary.mean)} />
          <Stat k={`${winCap} range`} v={summary.count >= 2 ? `${fmtNum(summary.min)}–${fmtNum(summary.max)}` : "—"} />
          <Stat k="Draws" v={String(summary.count)} />
        </div>
      )}

      {newest.length > 0 && (
        <Card tier="raw" padded={false} className="px-3.5">
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
            {shown.map((r) => {
              const st = rangeStatus(r.value, low, high);
              return (
                <li key={r.id} className="grid items-center gap-x-3 py-2" style={{ gridTemplateColumns: onEditValue ? "1fr auto auto" : "1fr auto" }}>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: optimalStatusColor(st) }}>
                    {fmtValue(r.value, marker.unit)}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatDMY(r.measuredOn)}
                  </span>
                  {onEditValue && (
                    <IconAction onClick={() => onEditValue(r)} label="Edit value">
                      <PencilIcon size={13} />
                    </IconAction>
                  )}
                  {r.note && (
                    <p className="mt-0.5 text-xs" style={{ gridColumn: "1 / -1", color: "var(--text-secondary)" }}>
                      {r.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {newest.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2 text-center text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {showAll ? "Show less" : `+ ${newest.length - 12} older`}
            </button>
          )}
        </Card>
      )}

      {onAddValue && (
        <Button type="button" accent={ACCENT} onClick={onAddValue} className="self-start transition-opacity hover:opacity-90">
          + Add value
        </Button>
      )}
    </div>
  );
}
