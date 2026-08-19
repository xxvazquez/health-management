"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Methodology } from "@/components/ui/Methodology";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import {
  favoriteCombosByMeal,
  foodCategoryDistribution,
  foodVarietyOverTime,
  mealInstances,
  rankedFoods,
  type MealComboEntry,
} from "@/lib/aggregations/food";
import { recentNewFoodsWithContext } from "@/lib/aggregations/patterns";
import {
  computeNutritionPriorities,
  DIET_BALANCE_LABEL,
  type CoverageRow,
  type DietBalanceStatus,
  type GroupStatus,
} from "@/lib/aggregations/nutritionPriorities";
import { TYPE_ACCENT } from "@/taxonomy/categories";

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
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ color, background: color === "var(--text-muted)" ? "var(--page-plane)" : `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      {label}
    </span>
  );
}

/** The scope note repeated wherever a card intentionally ignores the page's
 * date-range filter and instead reads the full logged history through its
 * own fixed rolling windows — so that never happens silently. */
function AllTimeScopeNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
      <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
        Full history, not the range filter —
      </span>{" "}
      {children}
    </p>
  );
}

type InvestigationTab = "ingredients" | "categories" | "trends";
const INVESTIGATION_TABS: { key: InvestigationTab; label: string }[] = [
  { key: "ingredients", label: "Ingredients" },
  { key: "categories", label: "Categories" },
  { key: "trends", label: "Trends" },
];

const MIN_MEAL_INSTANCES_FOR_COMBINATIONS = 5;
/** Display order only — the combinations themselves are computed entirely
 * from logged meal tags, never assumed. Any meal tag outside this list
 * (there shouldn't be one, since the Log page only offers these four)
 * still renders, just after the known ones. */
const MEAL_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"];

export default function FoodPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const [tab, setTab] = useState<InvestigationTab>("ingredients");

  // The dietary-pattern synthesis (priorities, coverage, doing-well/
  // missing, pattern, trend, variety) always reads the full history
  // through its own fixed 7/30/90-day windows — "what should I prioritize
  // now" shouldn't change because the range filter below happens to be
  // narrowed to last month, and a 30-day rolling window can't be computed
  // correctly from a narrower slice anyway. Labeled explicitly wherever it
  // appears (see AllTimeScopeNote) rather than left as a silent mismatch
  // with the range-filtered charts underneath.
  const priorities = useMemo(() => computeNutritionPriorities(events), [events]);

  const distribution = useMemo(() => foodCategoryDistribution(filtered), [filtered]);
  const varietySeries = useMemo(() => foodVarietyOverTime(filtered), [filtered]);
  const ranked = useMemo(() => rankedFoods(filtered), [filtered]);
  const newFoods = useMemo(() => recentNewFoodsWithContext(filtered, 15), [filtered]);
  const mealInstancesList = useMemo(() => mealInstances(filtered), [filtered]);
  const mealInstanceCount = mealInstancesList.length;
  const combos = useMemo(() => favoriteCombosByMeal(mealInstancesList), [mealInstancesList]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const topFoods = ranked.slice(0, 10).map((f) => ({ label: f.item, value: f.count }));
  const allFoods = ranked.map((f) => ({ label: f.item, value: f.count }));

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Food
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          What to keep doing, what&apos;s missing, and what to prioritize next — based on what you&apos;ve actually
          logged, read against established dietary guidance behind the scenes.
        </p>
      </div>

      {/* ---------------------------------------------------------------- *
       * WHAT'S HAPPENING
       * ---------------------------------------------------------------- */}
      <p className="text-xs font-semibold tracking-wide uppercase lg:col-span-2" style={{ color: "var(--text-muted)" }}>
        What&apos;s happening
      </p>

      <div className="lg:col-span-2">
        {priorities.insufficientData ? (
          <Card tier="primary">
            <CardTitle subtitle="This page needs a bit more logged history before its recommendations are trustworthy.">
              Not enough data yet
            </CardTitle>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Only {priorities.daysWithFoodTracked} day{priorities.daysWithFoodTracked === 1 ? "" : "s"} with food
              logged so far. Keep logging on the Log page — your dietary pattern and the evidence below will fill in
              once there&apos;s enough to say something reliable.
            </p>
          </Card>
        ) : (
          <PatternSection priorities={priorities} />
        )}
      </div>

      {!priorities.insufficientData && (
        <div className="lg:col-span-2">
          <AllTimeScopeNote>
            your dietary pattern is evaluated from your full logged history in fixed 7/30/90-day windows ending on
            your most recent tracked day, independent of the date range you pick below.
          </AllTimeScopeNote>
        </div>
      )}

      {/* ---------------------------------------------------------------- *
       * SHOW ME THE EVIDENCE
       * ---------------------------------------------------------------- */}
      <div
        className="flex flex-wrap items-end justify-between gap-3 border-t pt-4 lg:col-span-2"
        style={{ borderColor: "var(--gridline)" }}
      >
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Evidence
          </p>
          {span && range && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {range.start} – {range.end}
            </p>
          )}
        </div>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Most frequently tracked foods in this range">
          Top ingredients
        </CardTitle>
        {topFoods.length > 0 ? (
          <RankedBarChart data={topFoods} color={TYPE_ACCENT.food} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      <Card tier="raw">
        <CardTitle size="sm" subtitle="How often each tracked food group has actually been logged — counts are logged days, not servings or grams.">
          Food-group coverage
        </CardTitle>
        {priorities.coverageTable.length > 0 ? (
          <CoverageTableRows rows={priorities.coverageTable} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough data yet.</p>
        )}
        <div className="mt-3">
          <AllTimeScopeNote>fixed 7-day and 30-day windows ending today, independent of the range filter above.</AllTimeScopeNote>
        </div>
      </Card>

      <Card tier="raw" className="lg:col-span-2">
        <CardTitle size="sm" subtitle="Rolling 7-day and 30-day unique food counts">
          Ingredient variety over time
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

      <FavoriteCombosByMeal combos={combos} mealInstanceCount={mealInstanceCount} />

      {/* ---------------------------------------------------------------- *
       * LET ME INVESTIGATE
       * ---------------------------------------------------------------- */}
      <div className="border-t pt-4 lg:col-span-2" style={{ borderColor: "var(--gridline)" }}>
        <p className="mb-3 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Investigate
        </p>
        <nav className="flex w-fit flex-wrap items-center gap-5 border-b" style={{ borderColor: "var(--border-hairline)" }}>
          {INVESTIGATION_TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors"
                style={{
                  color: active ? TYPE_ACCENT.food : "var(--text-secondary)",
                  fontWeight: active ? 700 : 500,
                  borderBottom: `2px solid ${active ? TYPE_ACCENT.food : "transparent"}`,
                  marginBottom: "-1px",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-5 lg:col-span-2">
        {tab === "ingredients" && (
          <>
            <Card tier="raw">
              <CardTitle size="sm" subtitle="Every tracked food in this range, ranked by occurrences">
                All ingredients
              </CardTitle>
              {allFoods.length > 0 ? (
                <RankedBarChart data={allFoods} color={TYPE_ACCENT.food} />
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
              )}
            </Card>
            <PersonalObservations newFoods={newFoods} />
          </>
        )}

        {tab === "categories" && (
          <Card tier="raw">
            <CardTitle size="sm" subtitle="Every broad food category, ranked by tracked occurrences in this range">
              Category distribution
            </CardTitle>
            <RankedBarChart data={distribution.map((d) => ({ label: d.category, value: d.count }))} color={TYPE_ACCENT.food} />
          </Card>
        )}

        {tab === "trends" && (
          <>
            <AllTimeScopeNote>
              the trend comparison and variety metrics below always read your full logged history in fixed windows,
              independent of the range filter above.
            </AllTimeScopeNote>
            {priorities.insufficientData ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough data yet.</p>
            ) : (
              <>
                {priorities.trend.available && <TrendSection trend={priorities.trend} />}
                <VarietySection variety={priorities.variety} />
              </>
            )}
          </>
        )}
      </div>

      <Methodology className="lg:col-span-2">
        Priorities combine your logged intake with general dietary-guidance consensus — never individual studies —
        weighted by recency, variety, and how well-established the evidence is for that food group. &quot;Not
        logged&quot; only ever means not logged, never &quot;not eaten&quot;: this data reflects what you chose to
        track. Personal observations never diagnose anything, and the absence of a symptom association is never
        proof of tolerance.
      </Methodology>
    </div>
  );
}

function CoverageTableRows({ rows }: { rows: CoverageRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            <th className="pb-2 pr-8 font-medium">Food group</th>
            <th className="pb-2 pr-5 text-right font-medium">7 days</th>
            <th className="pb-2 pr-5 text-right font-medium">30 days</th>
            <th className="pb-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t whitespace-nowrap" style={{ borderColor: "var(--gridline)" }}>
              <td className="py-2 pr-8" style={{ color: "var(--text-primary)" }}>{r.label}</td>
              <td className="py-2 pr-5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.days7}</td>
              <td className="py-2 pr-5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.days30}</td>
              <td className="py-2 text-right">
                <StatusPill status={r.status} label={r.statusLabel} color={STATUS_COLOR[r.status]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <Card tier="primary">
      <CardTitle subtitle="The overall shape of your diet, not a score">Your dietary pattern</CardTitle>
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

function VarietySection({ variety }: { variety: ReturnType<typeof computeNutritionPriorities>["variety"] }) {
  return (
    <Card tier="raw">
      <CardTitle size="sm" subtitle={`Distinct foods logged in the last ${variety.windowDays} days`}>
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

function TrendSection({ trend }: { trend: ReturnType<typeof computeNutritionPriorities>["trend"] }) {
  return (
    <Card tier="raw">
      <CardTitle size="sm" subtitle="Last 30 days vs. the 30 days before that">
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
    <Card tier="raw">
      <CardTitle size="sm" subtitle="Recently introduced foods and any same-day symptom association">
        Personal observations
      </CardTitle>
      {newFoods.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm" style={{ borderColor: "var(--gridline)" }}>
          {newFoods.map((f) => (
            <li key={f.item} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{f.item}</span>
                <span className="flex items-center gap-3">
                  <span className="rounded-md px-2 py-0.5 text-xs whitespace-nowrap" style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}>
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

/**
 * "What do I most commonly eat together for breakfast/lunch/dinner/snack" —
 * the exact multi-ingredient sets that recur within the same meal instance,
 * grouped by meal and ranked by how often that exact set repeated. Not a
 * ranking of individual foods, and not just pairs.
 */
function FavoriteCombosByMeal({ combos, mealInstanceCount }: { combos: MealComboEntry[]; mealInstanceCount: number }) {
  const seenTags = Array.from(new Set(combos.map((c) => c.mealTag)));
  const orderedTags = [
    ...MEAL_ORDER.filter((m) => seenTags.includes(m)),
    ...seenTags.filter((m) => !MEAL_ORDER.includes(m)),
  ];

  return (
    <Card tier="raw" className="lg:col-span-2">
      <CardTitle
        size="sm"
        subtitle="The exact sets of ingredients logged together most often in the same meal — what you actually eat together, ranked by how often that exact combination repeated."
      >
        Favorite combinations by meal
      </CardTitle>
      {mealInstanceCount < MIN_MEAL_INSTANCES_FOR_COMBINATIONS ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Not enough meals tagged yet ({mealInstanceCount} logged with a meal tag) — this fills in as you log food
          from the Log page, which always tags a meal. Older imported history mostly predates this field, so this
          section will read sparse for a while on that data.
        </p>
      ) : orderedTags.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No combination of 2 or more ingredients has repeated together often enough yet in any meal.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {orderedTags.map((mealTag) => {
            const mealCombos = combos.filter((c) => c.mealTag === mealTag).slice(0, 5);
            const maxCount = Math.max(...mealCombos.map((c) => c.count), 1);
            return (
              <div key={mealTag}>
                <p className="mb-2.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  {mealTag}
                </p>
                {mealCombos.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>No repeated combination yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {mealCombos.map((c) => (
                      <li key={c.items.join("+")}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                            {c.items.join(" + ")}
                          </span>
                          <span className="shrink-0 tabular-nums text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                            {c.count}×
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full rounded-full" style={{ background: "var(--gridline)" }}>
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${Math.max(6, Math.round((c.count / maxCount) * 100))}%`, background: TYPE_ACCENT.food }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
