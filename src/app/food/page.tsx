"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { StackedCategoryChart } from "@/components/charts/StackedCategoryChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import {
  foodCategoryDistribution,
  foodCategoryTimeline,
  foodVarietyOverTime,
  foodVarietySummary,
  rankedFoods,
  type TimelineGranularity,
} from "@/lib/aggregations/food";
import { recentNewFoodsWithContext } from "@/lib/aggregations/patterns";
import { categoryDiversificationGaps, foodsWorthPrioritizing, type PriorityLevel } from "@/lib/aggregations/prioritization";
import { EVIDENCE_TIER_EXPLANATION, type EvidenceTier } from "@/lib/nutritionEvidence";
import { TYPE_ACCENT, colorForCategorySlot } from "@/taxonomy/categories";
import clsx from "clsx";

export default function FoodPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const [granularity, setGranularity] = useState<TimelineGranularity>("week");

  const distribution = useMemo(() => foodCategoryDistribution(filtered), [filtered]);
  const variety = useMemo(() => foodVarietySummary(filtered), [filtered]);
  const varietySeries = useMemo(() => foodVarietyOverTime(filtered), [filtered]);
  const ranked = useMemo(() => rankedFoods(filtered), [filtered]);
  const timeline = useMemo(() => foodCategoryTimeline(filtered, granularity), [filtered, granularity]);
  const newFoods = useMemo(() => recentNewFoodsWithContext(filtered, 15), [filtered]);
  const priorityFoods = useMemo(() => foodsWorthPrioritizing(filtered), [filtered]);
  const categoryGaps = useMemo(() => categoryDiversificationGaps(filtered), [filtered]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  // There are exactly 8 food categories, matching the 8 validated
  // colorblind-safe slots — every category gets its own real color here,
  // nothing needs to fold into "Other".
  const categoriesWithData = distribution.filter((d) => d.count > 0);
  const donutData = categoriesWithData.map((d) => ({
    label: d.category,
    value: d.count,
    color: colorForCategorySlot(d.category),
  }));

  const timelineCategories = categoriesWithData.map((d) => d.category);

  const topFoods = ranked.slice(0, 10).map((f) => ({ label: f.item, value: f.count }));
  const rareFoods = ranked
    .filter((f) => f.count > 0)
    .slice(-10)
    .reverse()
    .map((f) => ({ label: f.item, value: f.count }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Food
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            What you&apos;re actually eating — by category, variety, and time.
          </p>
        </div>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Unique foods" value={String(variety.uniqueFoods)} accent={TYPE_ACCENT.food} />
        <StatTile
          label="Categories represented"
          value={`${variety.categoriesRepresented} / ${variety.totalFoodCategories}`}
          accent={TYPE_ACCENT.food}
        />
        <StatTile label="Days with food tracked" value={String(variety.daysWithAnyFoodTracked)} />
        <StatTile
          label="Avg 7-day variety"
          value={
            varietySeries.length > 0
              ? String(Math.round(varietySeries.reduce((s, v) => s + v.rolling7dUniqueFoods, 0) / varietySeries.length))
              : "—"
          }
          detail="unique foods per rolling week"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Every food category, ranked by tracked occurrences">Category distribution</CardTitle>
          <RankedBarChart
            data={distribution.map((d) => ({ label: d.category, value: d.count }))}
            color={TYPE_ACCENT.food}
          />
        </Card>
        <Card>
          <CardTitle subtitle="Share of tracked entries by category">Broad distribution</CardTitle>
          {donutData.length > 0 ? (
            <DonutChart data={donutData} />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No food tracked in this range.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Most frequently tracked foods in this range">Top foods</CardTitle>
          {topFoods.length > 0 ? (
            <RankedBarChart data={topFoods} color={TYPE_ACCENT.food} />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
        <Card>
          <CardTitle subtitle="Foods tracked least often (excluding never-tracked ones)">Rare foods</CardTitle>
          {rareFoods.length > 0 ? (
            <RankedBarChart data={rareFoods} color={TYPE_ACCENT.food} />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle subtitle="Rolling 7-day and 30-day unique food counts — descriptive only, not a health verdict">
            Food variety over time
          </CardTitle>
        </div>
        {varietySeries.length > 0 ? (
          <MultiLineChart
            data={varietySeries.map((v) => ({ date: v.date, "7-day": v.rolling7dUniqueFoods, "30-day": v.rolling30dUniqueFoods }))}
            series={[
              { key: "7-day", label: "7-day variety", color: "var(--series-1)" },
              { key: "30-day", label: "30-day variety", color: "var(--series-2)" },
            ]}
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle subtitle="Category mix across time — see periods where a category rose or dropped">
            Category timeline
          </CardTitle>
          <div className="flex gap-1">
            {(["day", "week", "month"] as TimelineGranularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={clsx("rounded-full px-3 py-1 text-xs font-medium capitalize")}
                style={{
                  background: granularity === g ? "var(--series-1)" : "var(--page-plane)",
                  color: granularity === g ? "#fff" : "var(--text-secondary)",
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        {timeline.length > 0 ? (
          <StackedCategoryChart
            data={timeline.map((t) => ({ bucketStart: t.bucketStart, ...t.categoryCounts }))}
            categories={timelineCategories}
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      <Card>
        <CardTitle subtitle="Most recently first-tracked foods — whether they've been eaten again, and a same-day symptom check once there's enough data. Never implies absence of symptoms proves tolerance.">
          New foods introduced
        </CardTitle>
        {newFoods.length > 0 ? (
          <ul className="flex flex-col divide-y text-sm" style={{ borderColor: "var(--gridline)" }}>
            {newFoods.map((f) => (
              <li key={f.item} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {f.item}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
                    >
                      {f.category}
                    </span>
                    <span className="tabular-nums text-xs" style={{ color: "var(--text-muted)" }}>
                      first logged {f.firstSeenDate}
                    </span>
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {f.timesEatenTotal > 1
                    ? `Eaten ${f.timesEatenTotal - 1} more time${f.timesEatenTotal - 1 === 1 ? "" : "s"} since`
                    : "Not eaten again since"}
                  {" — "}
                  {f.symptomReadout === "insufficient-data" &&
                    "not enough same-day data yet to check symptom association"}
                  {f.symptomReadout === "no-elevated-association" &&
                    `no elevated same-day symptom association observed so far${f.symptomDetail ? ` (largest diff ${f.symptomDetail})` : ""}`}
                  {f.symptomReadout === "elevated-association" &&
                    `possible same-day symptom association observed (${f.symptomDetail}) — worth watching, not proof`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      <FoodsWorthPrioritizing entries={priorityFoods} gaps={categoryGaps} />
    </div>
  );
}

const EVIDENCE_TIER_COLOR: Record<EvidenceTier, string> = {
  Strong: "var(--status-good)",
  Moderate: "var(--series-1)",
  Limited: "var(--status-warning)",
  Unclear: "var(--text-muted)",
};

const PRIORITY_COLOR: Record<PriorityLevel, string> = {
  High: "var(--status-good)",
  Medium: "var(--series-1)",
  Low: "var(--text-muted)",
  "Already well represented": "var(--text-muted)",
};

function FoodsWorthPrioritizing({
  entries,
  gaps,
}: {
  entries: ReturnType<typeof foodsWorthPrioritizing>;
  gaps: ReturnType<typeof categoryDiversificationGaps>;
}) {
  const actionable = entries.filter((e) => e.priority !== "Already well represented");

  return (
    <Card>
      <CardTitle subtitle="Combines your logged intake with a small, sourced table of general dietary research (systematic reviews, meta-analyses, major cohort studies) for food groups with well-established evidence — not an exhaustive nutrition database. Never a personalized medical recommendation.">
        Foods worth prioritizing
      </CardTitle>

      {actionable.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No under-tracked food groups to flag right now — the groups this app has research evidence for are already reasonably represented in your logged diet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 font-medium">Food group</th>
                <th className="pb-2 text-right font-medium">My intake</th>
                <th className="pb-2 font-medium">Evidence</th>
                <th className="pb-2 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody>
              {actionable.map((e) => (
                <tr key={e.label} className="border-t align-top" style={{ borderColor: "var(--gridline)" }}>
                  <td className="py-3 pr-3" style={{ color: "var(--text-primary)" }}>
                    <div className="font-medium">{e.label}</div>
                    <p className="mt-1 max-w-md text-xs" style={{ color: "var(--text-secondary)" }}>
                      {e.personalizedNote}
                    </p>
                    {e.cautionNote && (
                      <p className="mt-1.5 max-w-md text-xs" style={{ color: "var(--status-warning)" }}>
                        {e.cautionNote}
                      </p>
                    )}
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs" style={{ color: "var(--text-muted)" }}>
                        Why & sources
                      </summary>
                      <p className="mt-1 max-w-md text-xs" style={{ color: "var(--text-secondary)" }}>
                        {e.summary} <span style={{ color: "var(--text-muted)" }}>{e.mechanismOrFinding}</span>
                      </p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {e.sources.map((s) => (
                          <li key={s.url}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs underline"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {s.citation}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {e.personalIntakeCount}
                  </td>
                  <td className="whitespace-nowrap py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: EVIDENCE_TIER_COLOR[e.evidenceTier], background: "var(--page-plane)" }}
                      title={EVIDENCE_TIER_EXPLANATION[e.evidenceTier]}
                    >
                      {e.evidenceTier}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-3">
                    <span className="text-xs font-medium" style={{ color: PRIORITY_COLOR[e.priority] }}>
                      {e.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--gridline)" }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Highest-priority categories to diversify
          </p>
          <ol className="flex flex-col gap-1.5 text-sm">
            {gaps.slice(0, 5).map((g, i) => (
              <li key={g.category} style={{ color: "var(--text-secondary)" }}>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {i + 1}.
                </span>{" "}
                <strong style={{ color: "var(--text-primary)" }}>{g.category}</strong> —{" "}
                {g.personalTrackingLevel} personal tracking ({g.uniqueFoodsInCategory} unique food
                {g.uniqueFoodsInCategory === 1 ? "" : "s"} logged) + {g.bestEvidenceTier?.toLowerCase()} evidence
                for at least one food in this category
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
