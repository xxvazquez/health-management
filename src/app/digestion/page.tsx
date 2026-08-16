"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { ColorStrip, type ColorStripPoint } from "@/components/charts/ColorStrip";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import {
  bristolBandDistribution,
  bristolDistribution,
  bristolRollingBands,
  bristolTimeline,
  digestiveSymptomStats,
  fiberStats,
  otherSymptomStats,
  stoolQualityStats,
  symptomFrequencyOverTime,
  unclassifiedStoolStats,
} from "@/lib/aggregations/digestion";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STRIP_WINDOW_DAYS = 90;

const BRISTOL_COLOR: Record<string, string> = {
  "Bristol 1": "var(--seq-100)",
  "Bristol 2": "var(--seq-200)",
  "Bristol 3": "var(--seq-300)",
  "Bristol 4": "var(--seq-450)",
  "Bristol 5": "var(--seq-600)",
  "No Bristol": "var(--series-other)",
};

const SYMPTOM_LINE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

export default function DigestionPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);

  const bristolDist = useMemo(() => bristolDistribution(filtered), [filtered]);
  const bristolBands = useMemo(() => bristolBandDistribution(filtered), [filtered]);
  const unclassifiedStool = useMemo(() => unclassifiedStoolStats(filtered), [filtered]);
  const rollingBands = useMemo(() => bristolRollingBands(filtered), [filtered]);
  const bristolTl = useMemo(() => bristolTimeline(filtered), [filtered]);
  const stoolQuality = useMemo(() => stoolQualityStats(filtered), [filtered]);
  const digestiveSymptoms = useMemo(() => digestiveSymptomStats(filtered), [filtered]);
  const otherSymptoms = useMemo(() => otherSymptomStats(filtered), [filtered]);
  const weeklySymptoms = useMemo(() => symptomFrequencyOverTime(filtered), [filtered]);
  const fiber = useMemo(() => fiberStats(filtered), [filtered]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const topBristol = [...bristolDist].sort((a, b) => b.count - a.count)[0];
  const totalDigestiveSymptomDays = new Set(
    filtered.filter((e) => e.category === "Digestive Symptom" && e.completed).map((e) => e.date),
  ).size;
  const totalStoolDays = new Set(filtered.filter((e) => e.subcategory === "Bristol Scale" && e.completed).map((e) => e.date)).size;

  const bristolStripPoints: ColorStripPoint[] = bristolTl.map((p) => ({
    date: p.date,
    color: BRISTOL_COLOR[p.item] ?? "var(--series-other)",
    title: `${p.date}: ${p.item}`,
  }));

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  const topSymptomKeys = Array.from(
    new Set(digestiveSymptoms.slice(0, 5).map((s) => s.item)),
  );
  const symptomLineData = weeklySymptoms.map((w) => {
    const row: Record<string, string | number> = { date: w.weekStart };
    for (const key of topSymptomKeys) row[key] = w.counts[key] ?? 0;
    return row;
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Digestion
          </h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-secondary)" }}>
            Bristol stool distribution and digestive symptoms — purely descriptive. This page never
            diagnoses anything; it only shows what&apos;s in your own tracked data.
          </p>
        </div>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Most common Bristol type"
          value={topBristol?.item ?? "—"}
          detail={topBristol ? `${topBristol.sharePct}% of ${totalStoolDays} classified days` : undefined}
          accent={TYPE_ACCENT.outcome}
        />
        <StatTile
          label="Unclassified stool entries"
          value={`${unclassifiedStool.unclassifiedSharePct}%`}
          detail={`${unclassifiedStool.unclassifiedCount} of ${unclassifiedStool.unclassifiedCount + unclassifiedStool.classifiedCount} logged stool entries — checked but not classifiable, not a Bristol type`}
        />
        <StatTile
          label="Digestive symptom days"
          value={String(totalDigestiveSymptomDays)}
          detail="days with a symptom logged"
          accent={TYPE_ACCENT.outcome}
        />
        <StatTile label="Symptom types tracked" value={String(digestiveSymptoms.length + otherSymptoms.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Classified entries only (Bristol 1–5). Unclassified 'No Bristol' entries are tracked separately above, not mixed in here.">
            Bristol type distribution
          </CardTitle>
          {bristolDist.length > 0 ? (
            <RankedBarChart
              data={bristolDist.map((b) => ({ label: b.item, value: b.count, color: BRISTOL_COLOR[b.item] }))}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No classified Bristol data in this range.</p>
          )}
        </Card>
        <Card>
          <CardTitle subtitle="Each mark is one logged day, colored by Bristol type — grey marks are unclassified ('No Bristol') entries">Bristol over time</CardTitle>
          {bristolStripPoints.length > 0 ? (
            <>
              <ColorStrip points={bristolStripPoints} />
              <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {Object.entries(BRISTOL_COLOR).map(([label, color]) => (
                  <span key={label} className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Bristol 1–2 grouped as looser, 3–4 as normal, 5 as harder — this app's source data only tracks types 1–5, not the full 7-point clinical scale">
            Stool pattern (grouped)
          </CardTitle>
          {bristolBands.length > 0 ? (
            <RankedBarChart
              data={bristolBands.map((b) => ({
                label: b.band,
                value: b.count,
                color: b.band === "Normal (3–4)" ? "var(--status-good)" : "var(--series-other)",
              }))}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No classified Bristol data in this range.</p>
          )}
        </Card>
        <Card>
          <CardTitle subtitle="Rolling 14-day share of classified entries in each band, plus unclassified share — shows whether the pattern is shifting">
            Stool pattern over time
          </CardTitle>
          {rollingBands.length > 0 ? (
            <MultiLineChart
              data={rollingBands.map((p) => ({
                date: p.date,
                Loose: p.loosePct,
                Normal: p.normalPct,
                Hard: p.hardPct,
                Unclassified: p.unclassifiedPct,
              }))}
              series={[
                { key: "Loose", label: "Loose (1–2)", color: "var(--series-1)" },
                { key: "Normal", label: "Normal (3–4)", color: "var(--status-good)" },
                { key: "Hard", label: "Hard (5)", color: "var(--series-8)" },
                { key: "Unclassified", label: "Unclassified", color: "var(--series-other)" },
              ]}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle subtitle="Weekly counts for the most frequent digestive symptoms">Digestive symptom trends</CardTitle>
        {symptomLineData.length > 0 && topSymptomKeys.length > 0 ? (
          <MultiLineChart
            data={symptomLineData}
            series={topSymptomKeys.map((key, i) => ({ key, label: key, color: SYMPTOM_LINE_COLORS[i % SYMPTOM_LINE_COLORS.length] }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No digestive symptom data.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Occurrences in this date range">Digestive symptoms</CardTitle>
          {digestiveSymptoms.length > 0 ? (
            <RankedBarChart
              data={digestiveSymptoms.map((s) => ({ label: s.item, value: s.daysCompleted }))}
              color={TYPE_ACCENT.outcome}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
        <Card>
          <CardTitle subtitle="Non-digestive symptoms also being tracked">Other symptoms</CardTitle>
          {otherSymptoms.length > 0 ? (
            <RankedBarChart
              data={otherSymptoms.map((s) => ({ label: s.item, value: s.daysCompleted }))}
              color={TYPE_ACCENT.outcome}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
      </div>

      {stoolQuality.length > 0 && (
        <Card>
          <CardTitle subtitle="Sticky / smelly stool occurrences, tracked separately from the Bristol type">Stool quality notes</CardTitle>
          <RankedBarChart data={stoolQuality.map((s) => ({ label: s.item, value: s.daysCompleted }))} color={TYPE_ACCENT.outcome} />
        </Card>
      )}

      {fiber.length > 0 && (
        <Card>
          <CardTitle subtitle="Logged from the Supplements tab, tracked here for its digestive relevance rather than on the Supplements dashboard">
            Fiber intake
          </CardTitle>
          <div className="flex flex-col gap-4">
            {fiber.map((item) => (
              <div key={item.item} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {item.item}
                  </span>
                  <span className="flex gap-4 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.consistencyPct}%</strong> consistency
                    </span>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.currentStreak}</strong> current streak
                    </span>
                    <span>
                      {item.daysCompleted}/{item.daysTracked} days
                    </span>
                  </span>
                </div>
                {clampedStripStart && (
                  <AdherenceStrip
                    startDate={clampedStripStart}
                    endDate={stripEnd}
                    stateByDate={buildStateByDate(filtered, item.item)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
