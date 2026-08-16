"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { StackedCategoryChart } from "@/components/charts/StackedCategoryChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import {
  foodCategoryDistribution,
  foodCategoryTimeline,
  foodVarietyOverTime,
  rankedFoods,
  type TimelineGranularity,
} from "@/lib/aggregations/food";
import { recentNewFoodsWithContext } from "@/lib/aggregations/patterns";
import {
  computeNutritionPriorities,
  DIET_BALANCE_LABEL,
  type Bullet,
  type DietBalanceStatus,
  type GroupStatus,
  type PriorityCandidate,
} from "@/lib/aggregations/nutritionPriorities";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import clsx from "clsx";

const STATUS_COLOR: Record<GroupStatus, string> = {
  "not-enough-data": "var(--text-muted)",
  priority: "var(--status-warning)",
  increase: "var(--series-4)",
  good: "var(--series-1)",
  strong: "var(--status-good)",
};

const DIET_BALANCE_COLOR: Record<DietBalanceStatus, string> = {
  "not-enough-data": "var(--text-muted)",
  underrepresented: "var(--status-warning)",
  "could-use-more-variety": "var(--series-4)",
  "well-represented": "var(--series-1)",
  "strongly-represented": "var(--status-good)",
};

function StatusPill({ status, label, color }: { status: string; label: string; color: string }) {
  return (
    <span
      key={status}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, background: color === "var(--text-muted)" ? "var(--page-plane)" : `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      {label}
    </span>
  );
}

export default function FoodPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const [granularity, setGranularity] = useState<TimelineGranularity>("week");

  // The decision-oriented sections always look at the full dataset — "what
  // should I prioritize now" shouldn't change because the chart filter
  // below happens to be narrowed to last month.
  const priorities = useMemo(() => computeNutritionPriorities(events), [events]);

  const distribution = useMemo(() => foodCategoryDistribution(filtered), [filtered]);
  const varietySeries = useMemo(() => foodVarietyOverTime(filtered), [filtered]);
  const ranked = useMemo(() => rankedFoods(filtered), [filtered]);
  const timeline = useMemo(() => foodCategoryTimeline(filtered, granularity), [filtered, granularity]);
  const newFoods = useMemo(() => recentNewFoodsWithContext(filtered, 15), [filtered]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const categoriesWithData = distribution.filter((d) => d.count > 0);
  const timelineCategories = categoriesWithData.map((d) => d.category);
  const topFoods = ranked.slice(0, 10).map((f) => ({ label: f.item, value: f.count }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Food
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          What to keep doing, what&apos;s missing, and what to prioritize next — based on what you&apos;ve actually
          logged, read against established dietary guidance behind the scenes.
        </p>
      </div>

      {priorities.insufficientData ? (
        <Card>
          <CardTitle subtitle="This page needs a bit more logged history before its recommendations are trustworthy.">
            Not enough data yet
          </CardTitle>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Only {priorities.daysWithFoodTracked} day{priorities.daysWithFoodTracked === 1 ? "" : "s"} with food
            logged so far. Keep logging on the Log page — priorities, coverage, and pattern analysis will appear
            here once there&apos;s enough to say something reliable.
          </p>
        </Card>
      ) : (
        <>
          <NextPriorities items={priorities.topPriorities} />
          <CoverageTable rows={priorities.coverageTable} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BulletCard title="What you're doing well" tone="var(--status-good)" bullets={priorities.doingWell} emptyText="Nothing clearly stands out yet — keep logging for a clearer picture." />
            <BulletCard title="What you're missing" tone="var(--status-warning)" bullets={priorities.missing} emptyText="No clear gaps against the tracked food groups right now." />
          </div>

          <VarietySection variety={priorities.variety} />
          <PatternSection priorities={priorities} />
          {priorities.trend.available && <TrendSection trend={priorities.trend} />}
        </>
      )}

      <PersonalObservations newFoods={newFoods} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Detailed analytics
        </h2>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle subtitle="Every broad food category, ranked by tracked occurrences">Category distribution</CardTitle>
          <RankedBarChart data={distribution.map((d) => ({ label: d.category, value: d.count }))} color={TYPE_ACCENT.food} />
        </Card>
        <Card>
          <CardTitle subtitle="Most frequently tracked foods in this range">Top foods</CardTitle>
          {topFoods.length > 0 ? (
            <RankedBarChart data={topFoods} color={TYPE_ACCENT.food} />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle subtitle="Rolling 7-day and 30-day unique food counts — descriptive only, not a health verdict">
          Food variety over time
        </CardTitle>
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
    </div>
  );
}

function NextPriorities({ items }: { items: PriorityCandidate[] }) {
  return (
    <Card>
      <CardTitle subtitle="Ranked from your logged intake, dietary-guidance importance, variety, and recency — a short list on purpose.">
        Your next priorities
      </CardTitle>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No standout gaps right now — your tracked food groups look reasonably well covered. See what&apos;s
          below for the fuller picture.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item, i) => (
            <li key={item.headline} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
              >
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {item.action}
                  {item.exampleFoods.length > 0 && (
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}> — {item.exampleFoods.join(", ")}</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function CoverageTable({ rows }: { rows: { label: string; days7: number; days30: number; status: GroupStatus; statusLabel: string }[] }) {
  return (
    <Card>
      <CardTitle subtitle="How often each tracked food group has actually been logged — counts are logged days, not servings or grams.">
        Nutrition coverage
      </CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
              <th className="pb-2 font-medium">Food group</th>
              <th className="pb-2 text-right font-medium">7 days</th>
              <th className="pb-2 text-right font-medium">30 days</th>
              <th className="pb-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="py-2" style={{ color: "var(--text-primary)" }}>{r.label}</td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.days7}</td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.days30}</td>
                <td className="py-2 text-right">
                  <StatusPill status={r.status} label={r.statusLabel} color={STATUS_COLOR[r.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BulletCard({ title, tone, bullets, emptyText }: { title: string; tone: string; bullets: Bullet[]; emptyText: string }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {bullets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bullets.map((b) => (
            <li key={b.label} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{b.label}</span> — {b.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function VarietySection({ variety }: { variety: ReturnType<typeof computeNutritionPriorities>["variety"] }) {
  return (
    <Card>
      <CardTitle subtitle={`Distinct foods logged in the last ${variety.windowDays} days — descriptive diversity metrics, not a target to hit.`}>
        Variety
      </CardTitle>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Food variety" value={String(variety.totalUniqueFoods)} detail="unique foods" />
        <StatTile label="Plant variety" value={String(variety.uniquePlantFoods)} detail="unique plant foods" accent="var(--status-good)" />
        <StatTile
          label="Plant-group variety"
          value={`${variety.plantGroupsRepresented} / ${variety.totalPlantGroups}`}
          detail="plant food groups represented"
        />
        <StatTile label="Vegetable variety" value={String(variety.uniqueVegetables)} detail="unique vegetables" />
        <StatTile label="Fruit variety" value={String(variety.uniqueFruit)} detail="unique fruits" />
        <StatTile label="Legume variety" value={String(variety.uniqueLegumes)} detail="unique legumes" />
        <StatTile label="Nut/seed variety" value={String(variety.uniqueNutsSeeds)} detail="unique nuts & seeds" />
        {variety.plantFamiliesRepresented > 0 && (
          <StatTile
            label="Plant families"
            value={String(variety.plantFamiliesRepresented)}
            detail="best-effort, not exhaustive"
          />
        )}
      </div>
    </Card>
  );
}

function PatternSection({ priorities }: { priorities: ReturnType<typeof computeNutritionPriorities> }) {
  const { pattern, dietBalance } = priorities;
  const groups: { title: string; items: string[]; tone: string }[] = [
    { title: "Strong", items: pattern.strong, tone: "var(--status-good)" },
    { title: "Needs more variety", items: pattern.needsVariety, tone: "var(--series-4)" },
    { title: "Underrepresented", items: pattern.underrepresented, tone: "var(--status-warning)" },
  ];

  return (
    <Card>
      <CardTitle subtitle="The overall shape of your diet — not a score, and not a diagnosis of any single food.">
        Your dietary pattern
      </CardTitle>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: g.tone }}>{g.title}</p>
            {g.items.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>—</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {g.items.map((item) => (
                  <li key={item} className="text-sm" style={{ color: "var(--text-secondary)" }}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--gridline)" }}>
        {dietBalance.map((row) => (
          <span key={row.pillar} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            {row.label}
            <StatusPill status={row.status} label={DIET_BALANCE_LABEL[row.status]} color={DIET_BALANCE_COLOR[row.status]} />
          </span>
        ))}
      </div>
    </Card>
  );
}

function TrendSection({ trend }: { trend: ReturnType<typeof computeNutritionPriorities>["trend"] }) {
  return (
    <Card>
      <CardTitle subtitle="Last 30 days vs. the 30 days before that — descriptive only, never a claim about why it changed.">
        Over time
      </CardTitle>
      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
        {trend.points.map((p) => {
          const direction = p.current > p.previous ? "up" : p.current < p.previous ? "down" : "flat";
          const color = direction === "up" ? "var(--status-good)" : direction === "down" ? "var(--status-warning)" : "var(--text-muted)";
          return (
            <li key={p.label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>{p.label}</span>
              <span className="tabular-nums font-medium" style={{ color }}>
                {p.previous} → {p.current}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PersonalObservations({ newFoods }: { newFoods: ReturnType<typeof recentNewFoodsWithContext> }) {
  return (
    <Card>
      <CardTitle subtitle="Secondary to the priorities above — a cautious look at recently introduced foods and any same-day symptom association. Never a diagnosis, and absence of a signal is never proof of tolerance.">
        Personal observations
      </CardTitle>
      {newFoods.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm" style={{ borderColor: "var(--gridline)" }}>
          {newFoods.map((f) => (
            <li key={f.item} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{f.item}</span>
                <span className="flex items-center gap-3">
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}>
                    {f.category}
                  </span>
                  <span className="tabular-nums text-xs" style={{ color: "var(--text-muted)" }}>first logged {f.firstSeenDate}</span>
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {f.timesEatenTotal > 1
                  ? `Eaten ${f.timesEatenTotal - 1} more time${f.timesEatenTotal - 1 === 1 ? "" : "s"} since`
                  : "Not eaten again since"}
                {" — "}
                {f.symptomReadout === "insufficient-data" && "not enough same-day data yet to check symptom association"}
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
  );
}
