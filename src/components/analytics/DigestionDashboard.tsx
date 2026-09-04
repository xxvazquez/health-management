"use client";

import { useMemo } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { Methodology } from "@/components/ui/Methodology";
import { SampleTierBadge } from "@/components/ui/SampleTierBadge";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { BristolScoreChart } from "@/components/charts/BristolScoreChart";
import { TrendAreaChart } from "@/components/charts/TrendAreaChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate, daysBetween, formatMonthYear, filterByDateRange } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import {
  bristolBandDistribution,
  bristolMonthlyScoreAverage,
  bristolScoreSeries,
  bristolTargetRangeChange,
  digestionInsight,
  digestiveSymptomRateChange,
  digestiveSymptomStats,
  fiberStats,
  otherSymptomStats,
  stoolCharacteristicStats,
  stoolColorDistribution,
  hygieneDistribution,
  averageTimeOnToiletMinutes,
  symptomFrequencyOverTime,
  stoolSymptomStats,
} from "@/lib/aggregations/digestion";
import { generateBristolPatterns } from "@/lib/aggregations/bristolPatterns";
import { MULTIPLE_COMPARISONS_NOTE } from "@/lib/aggregations/patterns";

/** One accent for the whole page — the same deep indigo the Log page's
 * Stool tab and the Analytics domain switcher use for digestion. */
const ACCENT = "var(--series-indigo)";

/** "the same day as X" / "the day after X" / "2 days after X" */
function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return "the same day as";
  if (lagDays === 1) return "the day after";
  return `${lagDays} days after`;
}

const STRIP_WINDOW_DAYS = 90;
/** Past this many days in the selected range, "Bristol score over time"
 * switches from one point per observation to a monthly average — beyond
 * roughly 4 months, per-observation points overlap into an unreadable wall
 * of dots anyway. */
const SCORE_CHART_MONTHLY_THRESHOLD_DAYS = 120;

const BAND_COLOR: Record<string, string> = {
  "Hard (1–2)": "var(--series-8)",
  "Normal (3–4)": "var(--status-good)",
  "Loose (5–7)": "var(--series-1)",
};

const SYMPTOM_LINE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-magenta)"];

function deltaDetail(recentPct: number | null, priorPct: number | null): string | undefined {
  if (recentPct === null) return undefined;
  if (priorPct === null) return "not enough prior data to compare";
  const priorRounded = Math.round(priorPct);
  const diff = Math.round(recentPct) - priorRounded;
  if (diff === 0) return `no change from the previous 30 days`;
  const points = Math.abs(diff);
  return `${diff > 0 ? "up" : "down"} ${points} point${points === 1 ? "" : "s"} from ${priorRounded}% the previous 30 days`;
}

export function DigestionDashboard() {
  const { status, events, workoutLogs, stoolLogs } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const filteredWorkoutLogs = useMemo(
    () => (range ? workoutLogs.filter((g) => g.date >= range.start && g.date <= range.end) : workoutLogs),
    [workoutLogs, range],
  );
  const filteredStoolLogs = useMemo(() => filterByDateRange(stoolLogs, range ?? undefined), [stoolLogs, range]);

  // The hero insight and "at a glance" tiles always read the full history —
  // recent-vs-usual needs a stable baseline independent of the detail
  // charts' date filter.
  const insight = useMemo(() => digestionInsight(events, stoolLogs), [events, stoolLogs]);
  const rangeChange = useMemo(() => bristolTargetRangeChange(stoolLogs), [stoolLogs]);
  const symptomRateChange = useMemo(() => digestiveSymptomRateChange(events), [events]);
  const bristolPatterns = useMemo(
    () => generateBristolPatterns(filtered, filteredStoolLogs, filteredWorkoutLogs),
    [filtered, filteredStoolLogs, filteredWorkoutLogs],
  );

  const scoreSeries = useMemo(() => bristolScoreSeries(filteredStoolLogs), [filteredStoolLogs]);
  const monthlyScoreAverage = useMemo(() => bristolMonthlyScoreAverage(filteredStoolLogs), [filteredStoolLogs]);
  const rangeSpanDays = range ? daysBetween(range.start, range.end) : 0;
  const showMonthlyScoreView = rangeSpanDays > SCORE_CHART_MONTHLY_THRESHOLD_DAYS;
  const bristolBands = useMemo(() => bristolBandDistribution(filteredStoolLogs), [filteredStoolLogs]);
  const stoolCharacteristics = useMemo(() => stoolCharacteristicStats(filteredStoolLogs), [filteredStoolLogs]);
  const stoolSymptoms = useMemo(() => stoolSymptomStats(filteredStoolLogs), [filteredStoolLogs]);
  const stoolColors = useMemo(() => stoolColorDistribution(filteredStoolLogs), [filteredStoolLogs]);
  const hygiene = useMemo(() => hygieneDistribution(filteredStoolLogs), [filteredStoolLogs]);
  const avgTimeOnToilet = useMemo(() => averageTimeOnToiletMinutes(filteredStoolLogs), [filteredStoolLogs]);
  const digestiveSymptoms = useMemo(() => digestiveSymptomStats(filtered), [filtered]);
  const otherSymptoms = useMemo(() => otherSymptomStats(filtered), [filtered]);
  const weeklySymptoms = useMemo(() => symptomFrequencyOverTime(filtered), [filtered]);
  const fiber = useMemo(() => fiberStats(filtered), [filtered]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  const topSymptomKeys = Array.from(new Set(digestiveSymptoms.slice(0, 5).map((s) => s.item)));
  const symptomLineData = weeklySymptoms.map((w) => {
    const row: Record<string, string | number> = { date: w.weekStart };
    for (const key of topSymptomKeys) row[key] = w.counts[key] ?? 0;
    return row;
  });
  const topSymptomOverall = [...digestiveSymptoms].sort((a, b) => b.daysCompleted - a.daysCompleted)[0];

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <DashboardHeader accent={ACCENT} className="lg:col-span-2">
        Digestion
      </DashboardHeader>

      <Insight label="What stands out" headline={insight.headline} detail={insight.detail} tone={insight.tone} />

      {!insight.insufficientData && insight.changed.length > 0 && (
        <BulletList title="What changed" tone="var(--text-muted)" bullets={insight.changed} />
      )}

      {span && range && (
        <div className="lg:col-span-2">
          <DateRangeFilter span={span} value={range} onChange={setRange} accent={ACCENT} />
        </div>
      )}

      <Card tier="raw" className="lg:col-span-2">
        <CardTitle
          size="sm"
          subtitle={
            showMonthlyScoreView
              ? "Target range: 3–4. Monthly average — too wide a range to show every observation legibly."
              : "Target range: 3–4. Each point is one recorded observation."
          }
        >
          Bristol score over time
        </CardTitle>
        {showMonthlyScoreView ? (
          monthlyScoreAverage.length > 0 ? (
            <TrendAreaChart
              data={monthlyScoreAverage.map((m) => ({ date: m.monthStart, value: m.avgScore }))}
              color={ACCENT}
              valueLabel="Avg Bristol score"
              xTickFormatter={formatMonthYear}
              showEveryTick
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No Bristol data in this range.</p>
          )
        ) : scoreSeries.length > 0 ? (
          <BristolScoreChart data={scoreSeries} color={ACCENT} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No Bristol data in this range.</p>
        )}
      </Card>

      <div>
        <p className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          At a glance — last 30 days
        </p>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="In target range (3–4)"
            value={rangeChange.recentPct !== null ? `${Math.round(rangeChange.recentPct)}%` : "—"}
            detail={deltaDetail(rangeChange.recentPct, rangeChange.priorPct)}
            accent={ACCENT}
          />
          <StatTile
            label="Digestive symptom rate"
            value={symptomRateChange.recentPct !== null ? `${Math.round(symptomRateChange.recentPct)}%` : "—"}
            detail={deltaDetail(symptomRateChange.recentPct, symptomRateChange.priorPct)}
          />
        </div>
      </div>

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Grouped into three bands for a quicker read than seven separate types">
          Stool consistency distribution
        </CardTitle>
        {bristolBands.length > 0 ? (
          <RankedBarChart data={bristolBands.map((b) => ({ label: b.band, value: b.count, color: BAND_COLOR[b.band] }))} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No Bristol data in this range.</p>
        )}
      </Card>

      <Card tier="raw" className="lg:col-span-2">
        <CardTitle
          size="sm"
          subtitle="Each pair shows whichever of 4 lags (same day to +3 days) has the strongest signal. Single factors only, not combinations."
        >
          Associated with Bristol 3–4
        </CardTitle>
        {bristolPatterns.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {bristolPatterns.map((p, i) => (
              <div key={i} className="rounded-lg border p-3.5" style={{ borderColor: "var(--gridline)" }}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.outcomeLabel}{" "}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      {p.diffPct > 0 ? "occurred more often" : "occurred less often"}
                    </span>{" "}
                    {lagPhrase(p.lagDays)} {p.causeLabel}
                  </p>
                  <SampleTierBadge tier={p.sampleTier} />
                </div>
                <ComparisonBars
                  withLabel={`With ${p.causeLabel}`}
                  withPct={p.withPct}
                  withCount={p.withCount}
                  withTotal={p.withTotal}
                  withoutLabel={`Without ${p.causeLabel}`}
                  withoutPct={p.withoutPct}
                  withoutCount={p.withoutCount}
                  withoutTotal={p.withoutTotal}
                  direction={p.diffPct > 0 ? "more" : "less"}
                />
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Association only, not evidence of cause — based on {p.withTotal + p.withoutTotal} days with a Bristol
                  reading logged.
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Not enough data yet to surface a reliable association (each comparison needs at least 10 exposed days and
            5 unexposed days, at every lag checked).
          </p>
        )}
        <div className="mt-4">
          <Methodology label="Why so few results?">{MULTIPLE_COMPARISONS_NOTE}</Methodology>
        </div>
      </Card>

      <p className="text-sm font-semibold lg:col-span-2" style={{ color: "var(--text-primary)" }}>
        Detailed exploration
      </p>

      <Card tier="raw" className="lg:col-span-2">
        <CardTitle size="sm" subtitle="Weekly counts for the most frequent digestive symptoms">Digestive symptom trends</CardTitle>
        {symptomLineData.length > 0 && topSymptomKeys.length > 0 ? (
          <>
            <MultiLineChart
              data={symptomLineData}
              series={topSymptomKeys.map((key, i) => ({ key, label: key, color: SYMPTOM_LINE_COLORS[i % SYMPTOM_LINE_COLORS.length] }))}
            />
            {topSymptomOverall && (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                {topSymptomOverall.item} has been the most frequently logged digestive symptom in this range
                ({topSymptomOverall.daysCompleted} days).
              </p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No digestive symptom data.</p>
        )}
      </Card>

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Occurrences in this date range">Digestive symptoms</CardTitle>
        {digestiveSymptoms.length > 0 ? (
          <RankedBarChart data={digestiveSymptoms.map((s) => ({ label: s.item, value: s.daysCompleted }))} color={ACCENT} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>
      <Card tier="raw">
        <CardTitle size="sm" subtitle="Non-digestive symptoms also being tracked">Other symptoms</CardTitle>
        {otherSymptoms.length > 0 ? (
          <RankedBarChart data={otherSymptoms.map((s) => ({ label: s.item, value: s.daysCompleted }))} color={ACCENT} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      {stoolCharacteristics.length > 0 && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Share of logged bowel movements with each characteristic, tracked separately from the Bristol type">
            Stool characteristics
          </CardTitle>
          <RankedBarChart data={stoolCharacteristics.map((c) => ({ label: c.label, value: c.count }))} color={ACCENT} />
        </Card>
      )}

      {stoolSymptoms.length > 0 && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Symptoms logged with a bowel movement — general symptoms are on the Symptoms tab">
            Stool symptoms
          </CardTitle>
          <RankedBarChart data={stoolSymptoms.map((s) => ({ label: s.label, value: s.count }))} color={ACCENT} />
        </Card>
      )}

      {(stoolColors.length > 0 || hygiene.length > 0 || avgTimeOnToilet !== null) && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Everything else logged on the Stool tab">
            Color, hygiene, and time
          </CardTitle>
          <div className="flex flex-col gap-3 text-sm">
            {stoolColors.length > 0 && (
              <p style={{ color: "var(--text-secondary)" }}>
                Color:{" "}
                {stoolColors.map((c, i) => (
                  <span key={c.label}>
                    {i > 0 && ", "}
                    <strong style={{ color: "var(--text-primary)" }}>{c.label}</strong> ({c.sharePct}%)
                  </span>
                ))}
              </p>
            )}
            {hygiene.length > 0 && (
              <p style={{ color: "var(--text-secondary)" }}>
                Hygiene:{" "}
                {hygiene.map((c, i) => (
                  <span key={c.label}>
                    {i > 0 && ", "}
                    <strong style={{ color: "var(--text-primary)" }}>{c.label}</strong> ({c.sharePct}%)
                  </span>
                ))}
              </p>
            )}
            {avgTimeOnToilet !== null && (
              <p style={{ color: "var(--text-secondary)" }}>
                Average time on toilet: <strong style={{ color: "var(--text-primary)" }}>{avgTimeOnToilet} min</strong>
              </p>
            )}
          </div>
        </Card>
      )}

      {fiber.length > 0 && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Logged from the Supplements tab, tracked here for its digestive relevance">
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
                  <AdherenceStrip startDate={clampedStripStart} endDate={stripEnd} stateByDate={buildStateByDate(filtered, item.item)} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Methodology className="lg:col-span-2">
        This page never diagnoses anything — it only describes what&apos;s in your own tracked data. The Bristol
        score line plots each reading (1–7) chronologically. &quot;What stands out&quot; and &quot;At a
        glance&quot; compare the last 30 days&apos; share of readings in the 3–4 target range against the 30 days
        before that, and need at least 4 entries in the most recent window to say anything. Bristol
        banding groups readings into Hard (1–2), Normal (3–4), and Loose (5–7) for a quicker read — a standard
        grouping shown for reference, not a verdict on your own data.
      </Methodology>
    </div>
  );
}
