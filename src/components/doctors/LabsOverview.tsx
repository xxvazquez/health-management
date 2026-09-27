"use client";

import { CHIP_CLS, CONTROL_CLS, CONTROL_STYLE, chipStyle } from "@/components/ui/Chip";
import { UpDownChevronIcon } from "@/components/ui/icons";
import { useState, type ReactNode } from "react";
import type { useLabs } from "@/lib/useLabs";
import { formatDMY, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import {
  clipMarkers,
  effectiveRange,
  labsSpan,
  rangeBar,
  rangeStatus,
  summariseWindow,
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
import { DateRangeFilter, describeDateRange, type DateRangePreset } from "@/components/ui/DateRangeFilter";
import { TabRail } from "@/components/ui/TabRail";
import { DetailPlaceholder, MedicalSplit, useIsDesktop } from "./MedicalSplit";

const ACCENT = "var(--ui-accent)";

type Mode = "average" | "last";
type SortKey = "panel" | "name";

/** Same rolling-window family as every other date-range control in the app
 * (`DateRangeFilter`'s own defaults, Vitals) — years expressed as days so
 * results share the one popover pattern instead of a bespoke pill row. */
const LAB_DATE_PRESETS: DateRangePreset[] = [
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
  { label: "5 years", days: 1826 },
  { label: "All time", days: "all" },
];

/** Trim padding artefacts off a widened track end (2.749999 → 2.7). */
function fmtNum(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmtValue(v: number, unit: string | null): string {
  return unit ? `${fmtNum(v)} ${unit}` : fmtNum(v);
}

/** The one "what to show" menu: the value (latest or window average) and
 * the order (grouped by panel or flat A–Z), as its four combinations. */
const VIEW_LABEL: Record<`${Mode}:${SortKey}`, string> = {
  "last:panel": "Last · By panel",
  "last:name": "Last · A–Z",
  "average:panel": "Average · By panel",
  "average:name": "Average · A–Z",
};

/** "1 year" / "2 years" / "5 years" / "all-time" — the active preset's own
 * label, lowercased to sit inline in a sentence ("… in the last 1 year"). */
function windowWord(label: string): string {
  return label === "All time" ? "all-time" : label.toLowerCase();
}

/** The read/analysis view of Health → Results: the panel list — every
 * marker on its reference-range bar with the optimal band marked — grouped
 * by panel or flat A–Z, with a time-window control that switches each row
 * between the window average (spread shown as a whisker) and the latest
 * reading. Tapping a marker opens its trend, window stats and full history,
 * plus add/edit for its values. Marker and panel config lives in Settings. */
export function LabsOverview({
  labs,
  onNewMarker,
  onAddValue,
  onEditValue,
}: {
  labs: ReturnType<typeof useLabs>;
  onNewMarker?: () => void;
  onAddValue?: (markerId: string) => void;
  onEditValue?: (markerId: string, result: LabResult) => void;
}) {
  const [range, setRange] = useState<DateRange | null>(null);
  const [mode, setMode] = useState<Mode>("last");
  const [sort, setSort] = useState<SortKey>("panel");
  const [panelFilter, setPanelFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const desktop = useIsDesktop();

  const today = todayLocalISODate();
  const allMarkers = labs.markers.data;
  const span = labsSpan(allMarkers);
  // Rolling window anchored at today, same as Vitals — not the dataset's own
  // end, so "1 year" always means the last 365 real days.
  const dateSpan: DateRange = { start: span?.start ?? today, end: today };
  const activeRange = range ?? dateSpan;
  const inRange = clipMarkers(allMarkers, activeRange.start);

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
            className={CHIP_CLS}
            style={chipStyle(true, ACCENT)}
          >
            Add a marker
          </button>
        )}
      </div>
    );
  }

  const listedMarkers = sort === "panel" ? shownSections.flatMap((s) => s.markers) : flatMarkers;
  // Desktop keeps a marker open so the detail pane is never an empty
  // placeholder; mobile stays list-first until one is tapped.
  const activeId = listedMarkers.some((m) => m.id === openId) ? openId : desktop ? (listedMarkers[0]?.id ?? null) : null;
  const openMarker = activeId ? inRange.find((m) => m.id === activeId) ?? null : null;

  if (openMarker && !desktop) {
    return (
      <MarkerDetailView
        marker={openMarker}
        dateSpan={dateSpan}
        range={activeRange}
        onRangeChange={setRange}
        windowStart={activeRange.start}
        windowEnd={activeRange.end}
        onBack={() => setOpenId(null)}
        onAddValue={onAddValue ? () => onAddValue(openMarker.id) : undefined}
        onEditValue={onEditValue ? (r) => onEditValue(openMarker.id, r) : undefined}
      />
    );
  }

  const rows = (markers: LabMarker[]) => (
    <MarkerGrid>
      {markers.map((m, i) => (
        <MarkerRow key={m.id} marker={m} mode={mode} first={i === 0} active={desktop && m.id === activeId} onOpen={() => setOpenId(m.id)} />
      ))}
    </MarkerGrid>
  );

  const markerList =
    sort === "panel" ? (
      <div className="flex flex-col gap-4">
        {shownSections.map((s) => (
          <div key={s.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-4">
              {s.icon && (
                <span style={{ color: customColorValue(s.color) ?? ACCENT }}>
                  <CustomIcon icon={s.icon} size={13} />
                </span>
              )}
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {s.name}
              </h3>
            </div>
            {rows(s.markers)}
          </div>
        ))}
      </div>
    ) : (
      rows(flatMarkers)
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <DateRangeFilter span={dateSpan} value={activeRange} onChange={setRange} presets={LAB_DATE_PRESETS} accent={ACCENT} />
        <label className={`${CONTROL_CLS} relative`} style={{ ...CONTROL_STYLE, color: ACCENT }}>
          {VIEW_LABEL[`${mode}:${sort}`]}
          <UpDownChevronIcon size={11} />
          {/* z-10: CONTROL_CLS's .hit-slop overlay would otherwise sit above the select. */}
          <select
            value={`${mode}:${sort}`}
            onChange={(e) => {
              const [m, k] = e.target.value.split(":") as [Mode, SortKey];
              setMode(m);
              setSort(k);
            }}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          >
            {Object.entries(VIEW_LABEL).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
      </div>

      {panelSections.length >= 2 && (
        <TabRail
          ariaLabel="Filter by panel"
          wrap={false}
          tall
          style={{ borderColor: "var(--border-hairline)" }}
          items={[{ id: "", name: "All" }, ...panelSections].map((s) => ({ id: s.id, label: s.name, accent: ACCENT }))}
          activeId={effectiveFilter ?? ""}
          onSelect={(id) => setPanelFilter(id || null)}
        />
      )}

      <MedicalSplit
        selected={!!openMarker}
        listWidth="26rem"
        stickyDetail
        list={markerList}
        detail={
          openMarker && (
            <MarkerDetailView
              marker={openMarker}
              dateSpan={dateSpan}
              range={activeRange}
              onRangeChange={setRange}
              windowStart={activeRange.start}
              windowEnd={activeRange.end}
              onAddValue={onAddValue ? () => onAddValue(openMarker.id) : undefined}
              onEditValue={onEditValue ? (r) => onEditValue(openMarker.id, r) : undefined}
            />
          )
        }
        placeholder={<DetailPlaceholder text="Pick a marker to see its trend and history." />}
      />

      <Methodology>
        This view only describes your own recorded results. Pick a time window at the top: <strong>Average</strong> reads the
        mean of every draw in it (the whisker on the bar is the lowest-to-highest spread), <strong>Last</strong> shows only the
        most recent draw. Each value is read against your optimal range where you&rsquo;ve set one, otherwise the lab reference
        low/high — both are lab- and sometimes age-specific, so treat a flag as a prompt to look, not a diagnosis. Every bar puts
        that range in the same place, with its limits underneath, so a dot left of it is low (L) and right of it is high (H).
        Open a marker for its full trend and history.
      </Methodology>
    </div>
  );
}

// --- Row -----------------------------------------------------------

/** One card of marker rows. The rows share its columns (bar, value, unit,
 * flag) through CSS subgrid, so each column is as wide as its widest entry
 * in the card and every value, unit and flag lines up down the list. */
function MarkerGrid({ children }: { children: ReactNode }) {
  return (
    <Card tier="raw" padded={false} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] px-3.5">
      {children}
    </Card>
  );
}

/** One marker: its name, then the range bar (normal band in the same place
 * on every row, the band's limits under its ends, a spread whisker in
 * Average mode), the value right-aligned, the unit, and an H or L flag when
 * out of range. Tap to open the marker. */
function MarkerRow({
  marker,
  mode,
  first,
  active = false,
  onOpen,
}: {
  marker: LabMarker;
  mode: Mode;
  first: boolean;
  /** The row whose detail is showing in the desktop right pane. */
  active?: boolean;
  onOpen: () => void;
}) {
  const summary = summariseWindow(marker.results);
  const { low, high } = effectiveRange(marker);
  const reading = summary ? (mode === "average" ? summary.mean : summary.latest) : null;
  const status = reading != null ? rangeStatus(reading, low, high) : null;
  const tone = optimalStatusColor(status);
  const bar = rangeBar(low, high);
  const showWhisker = mode === "average" && !!bar && !!summary && summary.count >= 2 && summary.max > summary.min;
  const flag = status === "high" ? "H" : status === "low" ? "L" : "";
  const limitColor = "color-mix(in oklab, var(--status-good) 70%, var(--text-muted))";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={`col-span-full -mx-1.5 grid grid-cols-subgrid px-1.5 pt-2.5 pb-2 text-left ${active ? "rounded-lg" : ""}`}
      style={{
        borderTop: first ? undefined : `1px solid ${active ? "transparent" : "var(--border-hairline)"}`,
        background: active ? "var(--page-plane)" : undefined,
      }}
    >
      <span className="col-span-full pb-2 text-sm leading-tight font-medium" style={{ color: "var(--text-primary)" }}>
        {marker.name}
      </span>

      {bar && reading != null ? (
        <span className="relative mr-2 ml-1.5 block h-8" aria-hidden="true">
          <span className="absolute inset-x-0 top-[5px] block h-[5px] rounded-full" style={{ background: "color-mix(in oklab, var(--gridline) 65%, var(--surface-1))" }} />
          <span
            className="absolute top-[3px] block h-[9px] rounded-full"
            style={{
              left: `${bar.bandLeftPct}%`,
              width: `${bar.bandRightPct - bar.bandLeftPct}%`,
              background: "color-mix(in oklab, var(--status-good) 22%, var(--gridline))",
            }}
          />
          {showWhisker && (
            <span
              className="absolute top-[7px] block h-[2px] rounded-full"
              style={{
                left: `${bar.pct(summary!.min)}%`,
                width: `${Math.max(bar.pct(summary!.max) - bar.pct(summary!.min), 1)}%`,
                background: "color-mix(in oklab, var(--text-secondary) 60%, transparent)",
              }}
            />
          )}
          <span
            className="absolute top-[1.5px] block h-[11px] w-[11px] rounded-full"
            style={{ left: `calc(${bar.pct(reading)}% - 5.5px)`, background: tone, boxShadow: "0 0 0 2.5px var(--surface-1)" }}
          />
          {low != null && (
            <span className="absolute top-[15px] -translate-x-1/2 text-xs tabular-nums" style={{ left: `${bar.bandLeftPct}%`, color: limitColor }}>
              {fmtNum(low)}
            </span>
          )}
          {high != null && (
            <span className="absolute top-[15px] -translate-x-1/2 text-xs tabular-nums" style={{ left: `${bar.bandRightPct}%`, color: limitColor }}>
              {fmtNum(high)}
            </span>
          )}
        </span>
      ) : (
        <span className="ml-1.5 block h-8 text-xs" style={{ color: "var(--text-muted)" }}>
          {reading == null ? "No reading in this window" : "No range set"}
        </span>
      )}

      <span className="pl-3 text-right text-sm leading-4 tabular-nums" style={{ color: status ? tone : "var(--text-primary)" }}>
        {reading != null ? fmtNum(reading) : "—"}
      </span>
      <span className="pl-1 text-xs leading-4 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
        {marker.unit ?? ""}
      </span>
      <span className="min-w-2.5 pl-2 text-center text-sm leading-4 font-semibold" style={{ color: tone }}>
        {flag}
        {flag && <span className="sr-only">{flag === "H" ? " (high)" : " (low)"}</span>}
      </span>
    </button>
  );
}

// --- Detail ------------------------------------------------------

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
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
  dateSpan,
  range,
  onRangeChange,
  windowStart,
  windowEnd,
  onBack,
  onAddValue,
  onEditValue,
}: {
  marker: LabMarker;
  dateSpan: DateRange;
  range: DateRange;
  onRangeChange: (v: DateRange) => void;
  windowStart: string;
  windowEnd: string;
  /** Set on mobile, where the detail replaces the list; the desktop pane sits beside it and has neither a back link nor its own window control. */
  onBack?: () => void;
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

  const win = windowWord(describeDateRange(LAB_DATE_PRESETS, dateSpan, range));
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
      {onBack && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            ← All results
          </button>
          <DateRangeFilter span={dateSpan} value={range} onChange={onRangeChange} presets={LAB_DATE_PRESETS} accent={ACCENT} />
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
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
          <ul className="flex flex-col inset-rows">
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
