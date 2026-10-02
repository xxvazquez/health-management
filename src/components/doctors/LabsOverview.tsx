"use client";

import { CHIP_CLS, CONTROL_CLS, CONTROL_STYLE, chipStyle } from "@/components/ui/Chip";
import { ChevronIcon, UpDownChevronIcon } from "@/components/ui/icons";
import { useState, type ReactNode } from "react";
import type { useLabs } from "@/lib/useLabs";
import type { LabNameLanguage } from "@/lib/labNames";
import { todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import {
  clipMarkers,
  effectiveRange,
  lastTestSummary,
  labsSpan,
  rangeBar,
  rangeStatus,
  summariseWindow,
  type LastTestItem,
  type LastTestSummary,
} from "@/lib/aggregations/labs";
import { optimalStatusColor } from "./labStatus";
import { formatDate, formatShortDate } from "./shared";
import { ShowAllRow, TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import type { LabMarker, LabResult } from "@/lib/supabase/labs";
import { InlineEmpty, ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";
import { Methodology } from "@/components/ui/Methodology";
import { LabMarkerChart, type LabMarkerChartPoint } from "@/components/charts/LabMarkerChart";
import { TrendCard, TrendHeadline, periodLabel, periodWindow, type ChartPeriod } from "@/components/charts/TrendCard";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";
import { DateRangeFilter, type DateRangePreset } from "@/components/ui/DateRangeFilter";
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

/** A lab value as entered — lab results often carry two or three decimals
 * (0.03, 2.15), so only floating-point noise is trimmed, never real digits. */
function fmtNum(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** A computed figure (an average): one decimal more than the readings it
 * comes from carry, at most two — whole-number readings average to 52.4. */
function fmtMean(v: number, readings: readonly number[]): string {
  const places = Math.min(2, Math.max(0, ...readings.map((r) => (String(r).split(".")[1] ?? "").length)) + 1);
  return String(Number(v.toFixed(places)));
}

/** The one "what to show" menu: the value (latest or window average) and
 * the order (grouped by panel or flat A–Z), as its four combinations. */
const VIEW_LABEL: Record<`${Mode}:${SortKey}`, string> = {
  "last:panel": "Last · By panel",
  "last:name": "Last · A–Z",
  "average:panel": "Average · By panel",
  "average:name": "Average · A–Z",
};

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
  nameLanguage = "pl",
  onNameLanguageChange,
}: {
  labs: ReturnType<typeof useLabs>;
  /** Which language the panel and marker names are shown in (see labNames.ts). */
  nameLanguage?: LabNameLanguage;
  onNameLanguageChange?: (lang: LabNameLanguage) => void;
  onNewMarker?: () => void;
  onAddValue?: (markerId: string) => void;
  onEditValue?: (markerId: string, result: LabResult) => void;
}) {
  const [range, setRange] = useState<DateRange | null>(null);
  const [mode, setMode] = useState<Mode>("last");
  const [sort, setSort] = useState<SortKey>("panel");
  const [panelFilter, setPanelFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [listScroll, setListScroll] = useState(0);
  const [showAllLastTest, setShowAllLastTest] = useState(false);
  const desktop = useIsDesktop();

  const today = todayLocalISODate();
  const allMarkers = labs.markers.data;
  const span = labsSpan(allMarkers);
  const lastTest = lastTestSummary(allMarkers);
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
  // The detail has its own period picker, so it gets every reading, not
  // just the ones inside the list's window.
  const openMarkerFull = openMarker ? allMarkers.find((m) => m.id === openMarker.id) ?? null : null;

  // On a phone the marker detail replaces the list: open it at the top, and
  // come back to the same place in the list.
  const openRow = (id: string) => {
    if (!desktop) {
      setListScroll(window.scrollY);
      window.scrollTo(0, 0);
    }
    setOpenId(id);
  };
  const backToList = () => {
    setOpenId(null);
    requestAnimationFrame(() => window.scrollTo(0, listScroll));
  };

  if (openMarker && !desktop) {
    return (
      <MarkerDetailView
        key={openMarker.id}
        marker={openMarkerFull ?? openMarker}
        today={today}
        onBack={backToList}
        onAddValue={onAddValue ? () => onAddValue(openMarker.id) : undefined}
        onEditValue={onEditValue ? (r) => onEditValue(openMarker.id, r) : undefined}
      />
    );
  }

  const rows = (markers: LabMarker[]) => (
    <MarkerGrid>
      {markers.map((m, i) => (
        <MarkerRow key={m.id} marker={m} mode={mode} first={i === 0} active={desktop && m.id === activeId} onOpen={() => openRow(m.id)} />
      ))}
    </MarkerGrid>
  );

  // On a phone it leads the page; on desktop it heads the list column so a
  // tapped marker opens in the pane beside it.
  const lastTestSection = lastTest && (
    <LastTestSection
      summary={lastTest}
      expanded={showAllLastTest}
      onToggle={() => setShowAllLastTest((v) => !v)}
      onOpen={(id) => {
        setPanelFilter(null);
        openRow(id);
      }}
    />
  );

  const markerRows =
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
  const markerList = desktop ? (
    <div className="flex flex-col gap-4">
      {lastTestSection}
      {markerRows}
    </div>
  ) : (
    markerRows
  );

  return (
    <div className="flex flex-col gap-4">
      {!desktop && lastTestSection}

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
        {onNameLanguageChange && (
          <button
            type="button"
            onClick={() => onNameLanguageChange(nameLanguage === "pl" ? "en" : "pl")}
            aria-label={nameLanguage === "pl" ? "Names in Polish. Show them in English" : "Names in English. Show them in Polish"}
            className={CONTROL_CLS}
            style={{ ...CONTROL_STYLE, color: ACCENT }}
          >
            <GlobeIcon />
            {nameLanguage === "pl" ? "PL" : "EN"}
          </button>
        )}
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
              key={openMarker.id}
              marker={openMarkerFull ?? openMarker}
              today={today}
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

const LAST_TEST_SHOWN = 5;

/** "High · was 1.8 in Mar 2025", "Back in range · was 52", "Up from 30 · Mar 2025". */
function lastTestNote(item: LastTestItem): string {
  const prev = item.previous;
  const when = prev ? new Date(`${prev.measuredOn}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
  if (item.kind === "out") {
    const label = item.status === "high" ? "High" : "Low";
    return prev ? `${label} · was ${fmtNum(prev.value)} in ${when}` : label;
  }
  if (item.kind === "back") return `Back in range · was ${fmtNum(prev!.value)} in ${when}`;
  return `${item.value > prev!.value ? "Up" : "Down"} from ${fmtNum(prev!.value)} · ${when}`;
}

/** The newest blood test at the top of Results: what's out of range, what
 * came back into range, and what moved notably since the result before. */
function LastTestSection({
  summary,
  expanded,
  onToggle,
  onOpen,
}: {
  summary: LastTestSummary;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (markerId: string) => void;
}) {
  const shown = expanded ? summary.items : summary.items.slice(0, LAST_TEST_SHOWN);
  return (
    <TrendGroup caption={`Last blood test · ${formatShortDate(summary.date)}`}>
      {summary.items.length === 0 ? (
        <TrendRow
          label={`All ${summary.markerCount} ${summary.markerCount === 1 ? "marker" : "markers"} in range`}
          sublabel="Nothing moved much since the test before"
        />
      ) : (
        shown.map((item) => {
          const flag = item.status === "high" ? "H" : item.status === "low" ? "L" : "";
          return (
            <TrendRow
              key={item.marker.id}
              label={item.marker.name}
              sublabel={lastTestNote(item)}
              value={
                <span className="flex items-baseline gap-1">
                  <span style={{ color: optimalStatusColor(item.status) }}>{fmtNum(item.value)}</span>
                  {item.marker.unit && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{item.marker.unit}</span>}
                  {flag && (
                    <span className="font-semibold" style={{ color: optimalStatusColor(item.status) }}>
                      {flag}
                    </span>
                  )}
                </span>
              }
              onClick={() => onOpen(item.marker.id)}
            />
          );
        })
      )}
      {summary.items.length > LAST_TEST_SHOWN && <ShowAllRow total={summary.items.length} expanded={expanded} onToggle={onToggle} />}
    </TrendGroup>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2 3 4.4 3 7s-1 5-3 7c-2-2-3-4.4-3-7s1-5 3-7Z" />
    </svg>
  );
}

// --- Row -----------------------------------------------------------

/** One card of marker rows. The rows share its columns (bar, value, unit,
 * flag) through CSS subgrid, so each column is as wide as its widest entry
 * in the card and every value, unit and flag lines up down the list. */
function MarkerGrid({ children }: { children: ReactNode }) {
  return (
    <Card tier="raw" padded={false} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] overflow-hidden">
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
      className={`relative col-span-full grid grid-cols-subgrid px-3.5 pt-2.5 pb-2 text-left ${first ? "" : "before:absolute before:top-0 before:right-0 before:left-3.5 before:border-t before:border-[var(--border-hairline)]"}`}
      style={{
        // The whole cell tints, edge to edge, with its separators kept — a selected iOS row.
        background: active ? `color-mix(in oklab, ${ACCENT} var(--tint-pct), transparent)` : undefined,
      }}
    >
      <span className="col-span-full pb-2 text-sm leading-tight font-medium" style={{ color: "var(--text-primary)" }}>
        {marker.name}
      </span>

      {bar && reading != null ? (
        <span className="relative mr-2 ml-1.5 block h-8" aria-hidden="true">
          <span className="absolute inset-x-0 top-[5px] block h-[5px] rounded-full" style={{ background: "color-mix(in oklab, var(--gridline) 65%, var(--surface-1))" }} />
          <span
            className="absolute top-[5px] block h-[5px] rounded-full"
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
        {reading == null ? "—" : mode === "average" ? fmtMean(reading, marker.results.map((r) => r.value)) : fmtNum(reading)}
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

/** A marker's history, newest first — the same columns as the Results list
 * (value right-aligned, unit, H/L flag) with the date on the left. Tapping
 * a row edits that reading. */
function ReadingRows({
  results,
  unit,
  low,
  high,
  onEdit,
}: {
  results: LabResult[];
  unit: string | null;
  low: number | null;
  high: number | null;
  onEdit?: (result: LabResult) => void;
}) {
  return (
    <Card tier="raw" padded={false} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] px-3.5">
      {results.map((r, i) => {
        const st = rangeStatus(r.value, low, high);
        const tone = optimalStatusColor(st);
        const flag = st === "high" ? "H" : st === "low" ? "L" : "";
        const cells = (
          <>
            <span className="text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatDate(r.measuredOn)}
            </span>
            <span className="pl-3 text-right text-sm tabular-nums" style={{ color: st ? tone : "var(--text-primary)" }}>
              {fmtNum(r.value)}
            </span>
            <span className="pl-1 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              {unit ?? ""}
            </span>
            <span className="min-w-2.5 pl-2 text-center text-sm font-semibold" style={{ color: tone }}>
              {flag}
              {flag && <span className="sr-only">{flag === "H" ? " (high)" : " (low)"}</span>}
            </span>
            {r.note && (
              <span className="col-span-full pb-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                {r.note}
              </span>
            )}
          </>
        );
        const rowCls = "col-span-full grid min-h-11 grid-cols-subgrid items-center py-2 text-left";
        const rowStyle = { borderTop: i === 0 ? undefined : "1px solid var(--border-hairline)" };
        return onEdit ? (
          <button key={r.id} type="button" onClick={() => onEdit(r)} aria-label={`Edit the ${formatDate(r.measuredOn)} reading`} className={rowCls} style={rowStyle}>
            {cells}
          </button>
        ) : (
          <div key={r.id} className={rowCls} style={rowStyle}>
            {cells}
          </div>
        );
      })}
    </Card>
  );
}

/** One row of the marker summary list: label left, value right. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span style={{ color: "var(--text-primary)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

function MarkerDetailView({
  marker,
  today,
  onBack,
  onAddValue,
  onEditValue,
}: {
  marker: LabMarker;
  today: string;
  /** Set on mobile, where the detail replaces the list; the desktop pane sits beside it and has no back link. */
  onBack?: () => void;
  onAddValue?: () => void;
  onEditValue?: (result: LabResult) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [period, setPeriod] = useState<ChartPeriod>("All");
  const [offset, setOffset] = useState(0);
  const [scrub, setScrub] = useState<LabMarkerChartPoint | null>(null);

  const ascending = [...marker.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const newest = [...ascending].reverse();
  const earliest = ascending[0]?.measuredOn ?? today;
  const span = periodWindow(period, offset, earliest, today);
  const inPeriod = ascending.filter((r) => r.measuredOn >= span.start && r.measuredOn <= span.end);
  const summary = summariseWindow(marker.results);
  const periodSummary = summariseWindow(inPeriod);
  const { low, high } = effectiveRange(marker);
  const rangeText = (lo: number | null, hi: number | null) =>
    lo != null && hi != null ? `${fmtNum(lo)}–${fmtNum(hi)}` : lo != null ? `≥ ${fmtNum(lo)}` : hi != null ? `≤ ${fmtNum(hi)}` : null;
  const normal = rangeText(marker.refLow, marker.refHigh);
  const optimal = rangeText(marker.optimalLow, marker.optimalHigh);

  const shownValue = scrub ? scrub.value : summary?.latest ?? null;
  const shownDate = scrub ? scrub.date : summary?.latestOn ?? null;
  const status = shownValue != null ? rangeStatus(shownValue, low, high) : null;
  const tone = optimalStatusColor(status);
  const statusWord = status === "high" ? "High" : status === "low" ? "Low" : status === "in" ? "In range" : null;
  const change = summary && summary.previous != null ? summary.latest - summary.previous : null;
  const changePct = change != null && summary!.previous !== 0 ? (change / Math.abs(summary!.previous!)) * 100 : null;
  const signed = (v: number, text: string) => (v > 0 ? `+${text}` : v < 0 ? `−${text.replace("-", "")}` : text);

  const shown = showAll ? newest : newest.slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button type="button" onClick={onBack} className="-ml-1 flex min-h-11 items-center gap-0.5 self-start text-sm font-medium" style={{ color: ACCENT }}>
          <ChevronIcon dir="left" size={16} />
          Results
        </button>
      )}

      <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {marker.name}
      </h2>

      {ascending.length > 0 && (
        <TrendCard
          period={period}
          onPeriod={setPeriod}
          offset={offset}
          onOffset={setOffset}
          earliest={earliest}
          today={today}
          accent={ACCENT}
          headline={
            offset > 0 && !scrub ? (
              periodSummary ? (
                <TrendHeadline
                  caption="Range"
                  value={periodSummary.count >= 2 ? `${fmtNum(periodSummary.min)}–${fmtNum(periodSummary.max)}` : fmtNum(periodSummary.latest)}
                  unit={marker.unit}
                  detail={`${periodLabel(span)} · ${periodSummary.count} reading${periodSummary.count === 1 ? "" : "s"}`}
                />
              ) : (
                <TrendHeadline caption="Range" value="—" detail={periodLabel(span)} />
              )
            ) : (
            shownValue != null &&
            shownDate && (
              <TrendHeadline
                caption={scrub ? formatDate(shownDate) : "Latest"}
                value={fmtNum(shownValue)}
                unit={marker.unit}
                color={status ? tone : undefined}
                detail={
                  <>
                    {statusWord && (
                      <>
                        <span className="font-semibold" style={{ color: tone }}>
                          {statusWord}
                        </span>
                        {" · "}
                      </>
                    )}
                    {[scrub ? null : formatDate(shownDate), normal && `normal ${normal}`, optimal && `optimal ${optimal}`].filter(Boolean).join(" · ")}
                  </>
                }
              />
            )
            )
          }
        >
          {inPeriod.length > 0 ? (
            <LabMarkerChart
              data={inPeriod.map((r) => ({ date: r.measuredOn, value: r.value }))}
              unit={marker.unit}
              refLow={marker.refLow}
              refHigh={marker.refHigh}
              optimalLow={marker.optimalLow}
              optimalHigh={marker.optimalHigh}
              windowStart={span.start}
              windowEnd={span.end}
              color="var(--series-other)"
              colorByRange
              onScrub={setScrub}
            />
          ) : (
            <p className="flex h-[220px] items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>
              No readings in this period.
            </p>
          )}
        </TrendCard>
      )}

      {summary && (change != null || summary.count >= 2) && (
        <Card tier="raw" padded={false} className="inset-rows px-3.5">
          {change != null && (
            <SummaryRow
              label="Change since previous"
              value={`${signed(change, fmtNum(Math.abs(change)))}${changePct != null ? ` (${signed(changePct, `${Math.abs(Math.round(changePct))}%`)})` : ""}`}
            />
          )}
          {periodSummary && periodSummary.count >= 2 && (
            <SummaryRow label={period === "All" ? "Average" : `Average, ${periodLabel(span)}`} value={fmtMean(periodSummary.mean, inPeriod.map((r) => r.value))} />
          )}
        </Card>
      )}

      {newest.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              Readings
            </h3>
            {onAddValue && (
              <button type="button" onClick={onAddValue} className="hit-slop text-sm font-medium" style={{ color: ACCENT }}>
                Add
              </button>
            )}
          </div>
          <ReadingRows results={shown} unit={marker.unit} low={low} high={high} onEdit={onEditValue} />
          {newest.length > 12 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="min-h-11 text-sm font-medium" style={{ color: ACCENT }}>
              {showAll ? "Show less" : `Show ${newest.length - 12} more`}
            </button>
          )}
        </section>
      )}

      {newest.length === 0 && onAddValue && (
        <button type="button" onClick={onAddValue} className="self-start text-sm font-medium" style={{ color: ACCENT }}>
          Add a reading
        </button>
      )}
    </div>
  );
}
