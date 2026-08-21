"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter, type DateRangePreset } from "@/components/ui/DateRangeFilter";
import { Methodology } from "@/components/ui/Methodology";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { daysBetween } from "@/lib/aggregations/common";
import {
  favoriteCombosByMeal,
  foodCategoryDistribution,
  foodVarietyOverTime,
  ingredientDiversity,
  mealInstances,
  mealTypeIngredientBreakdown,
  rankedFoods,
  repetitionInsights,
  topConcentrationShare,
  varietyTrendDirection,
  type MealComboEntry,
} from "@/lib/aggregations/food";
import {
  computeNutritionPriorities,
  type CoverageRow,
  type GroupStatus,
  type PriorityCandidate,
} from "@/lib/aggregations/nutritionPriorities";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STATUS_COLOR: Record<GroupStatus, string> = {
  "not-enough-data": "var(--text-muted)",
  priority: "var(--status-warning)",
  increase: "var(--series-4)",
  good: "var(--series-1)",
  strong: "var(--status-good)",
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

/** This week / 2 weeks / 1 month / 6 months / 1 year / All time — Food's
 * own preset wording, distinct from the "Last N days" phrasing every other
 * analytics page still uses (DateRangeFilter's `presets` prop is opt-in
 * precisely so this doesn't change those other pages). Arbitrary custom
 * ranges (3 weeks, 3 months, ...) are already covered by the component's
 * existing manual date inputs — no separate mechanism needed. */
const FOOD_DATE_PRESETS: DateRangePreset[] = [
  { label: "This week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "All time", days: "all" },
];

/**
 * Observed → Suggestion — deliberately citation-free. The research behind
 * each suggestion lives at Manage → Nutrition evidence instead; this card
 * only ever states what was logged and what to consider, in plain
 * language, matching the rest of Lauva.
 */
function RecommendationCard({ headline, detail, action }: { headline: string; detail: string; action: string | null }) {
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {headline}
      </span>
      {detail && (
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </span>
      )}
      {action && (
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {action}
        </span>
      )}
    </li>
  );
}

/** "oats, quinoa or buckwheat" — no Oxford comma, the given conjunction
 * before the last item, matching how a person would actually say a short
 * list out loud. */
function formatExampleList(foods: string[], conjunction: "or" | "and" = "or"): string {
  if (foods.length === 0) return "";
  if (foods.length === 1) return foods[0];
  if (foods.length === 2) return `${foods[0]} ${conjunction} ${foods[1]}`;
  return `${foods.slice(0, -1).join(", ")} ${conjunction} ${foods[foods.length - 1]}`;
}

/** Focus next week leans on concrete examples when the taxonomy has them —
 * "Good next step: oats, quinoa or buckwheat" is more actionable than
 * "Add whole grains" alone. Falls back to the plain action phrase for
 * variety candidates, which have no single example list. */
function focusSuggestionText(c: PriorityCandidate): string | null {
  if (c.exampleFoods.length > 0) return `Good next step: ${formatExampleList(c.exampleFoods)}.`;
  return c.action ? `${c.action}.` : null;
}

type InvestigationTab = "ingredients" | "categories" | "trends";
const INVESTIGATION_TABS: { key: InvestigationTab; label: string }[] = [
  { key: "ingredients", label: "Ingredients" },
  { key: "categories", label: "Categories" },
  { key: "trends", label: "Trends" },
];

const UNDERREPRESENTED_DEFAULT_COUNT = 5;
const REPETITION_DEFAULT_COUNT = 10;
const INGREDIENTS_DEFAULT_COUNT = 10;

/** Small "show N more" toggle, shared shape across the three lists on this
 * page that need one — no hidden info, just progressive disclosure. */
function ShowMoreButton({ hiddenCount, expanded, onClick }: { hiddenCount: number; expanded: boolean; onClick: () => void }) {
  if (hiddenCount <= 0 && !expanded) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 self-start text-xs font-medium underline decoration-dotted"
      style={{ color: "var(--series-2)" }}
    >
      {expanded ? "Show less" : `Show ${hiddenCount} more`}
    </button>
  );
}

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
  const [showAllUnderrepresented, setShowAllUnderrepresented] = useState(false);
  const [showAllRepetition, setShowAllRepetition] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);

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
  const mealInstancesList = useMemo(() => mealInstances(filtered), [filtered]);
  const mealInstanceCount = mealInstancesList.length;
  const combos = useMemo(() => favoriteCombosByMeal(mealInstancesList), [mealInstancesList]);
  const diversity = useMemo(() => (range ? ingredientDiversity(filtered, range, events) : null), [filtered, range, events]);
  const concentration = useMemo(() => topConcentrationShare(ranked, 3), [ranked]);
  const hasCoreGaps = priorities.missing.length > 0;
  const repetition = useMemo(
    () => repetitionInsights(ranked, mealInstancesList, priorities.groupStates, hasCoreGaps, 20),
    [ranked, mealInstancesList, priorities.groupStates, hasCoreGaps],
  );
  const mealBreakdown = useMemo(
    () => mealTypeIngredientBreakdown(mealInstancesList, ranked.slice(0, 8).map((r) => r.item)),
    [mealInstancesList, ranked],
  );
  const trendDirection = useMemo(() => varietyTrendDirection(varietySeries), [varietySeries]);
  // Names the actual highest-priority groups instead of a bare count — a
  // raw "10 groups underrepresented" reads as a verdict on its own; naming
  // which ones (already ranked by the same scoring the recommendation
  // cards use) is the same information without the alarming aggregate.
  const patternHighlight =
    priorities.underrepresentedGroups.length > 0
      ? `${formatExampleList(priorities.underrepresentedGroups.slice(0, 3).map((c) => c.headline.toLowerCase()), "and")} could be more regular`
      : "well covered right now";
  // Wording only ("this week" vs. the generic phrasing) — any 7-day-long
  // range reads as "this week" regardless of which control produced it
  // (the This-week preset or a manually picked 7-day custom range).
  const isThisWeek = range ? daysBetween(range.start, range.end) + 1 === 7 : false;

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const topFoods = ranked.slice(0, 10).map((f) => ({ label: f.item, value: f.count }));

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Food
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          What&apos;s missing and what to prioritize next — based on what you&apos;ve actually logged.
        </p>
      </div>

      {/* ---------------------------------------------------------------- *
       * WHAT'S HAPPENING
       * ---------------------------------------------------------------- */}
      {priorities.insufficientData ? (
        <div className="lg:col-span-2">
          <Card tier="supporting">
            <CardTitle subtitle="This page needs a bit more logged history before its recommendations are trustworthy.">
              Not enough data yet
            </CardTitle>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Only {priorities.daysWithFoodTracked} day{priorities.daysWithFoodTracked === 1 ? "" : "s"} with food
              logged so far. Keep logging on the Log page and this page fills in.
            </p>
          </Card>
        </div>
      ) : (
        <>
          <div className="lg:col-span-2">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>Food pattern</span> ·{" "}
              {priorities.variety.totalUniqueFoods} ingredients · {patternHighlight} · variety {trendDirection}
            </p>
            <div className="mt-1">
              <AllTimeScopeNote>
                full logged history, fixed 7/30/90-day windows — independent of the date range you pick below.
              </AllTimeScopeNote>
            </div>
          </div>

          <Card tier="supporting">
            <CardTitle size="sm" subtitle="Food groups that are rarely or never logged">
              Underrepresented foods
            </CardTitle>
            {priorities.underrepresentedGroups.length > 0 ? (
              <>
                <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
                  {(showAllUnderrepresented
                    ? priorities.underrepresentedGroups
                    : priorities.underrepresentedGroups.slice(0, UNDERREPRESENTED_DEFAULT_COUNT)
                  ).map((c) => (
                    <li key={c.headline} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{c.headline}</span>
                      <span className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>{c.detail}</span>
                    </li>
                  ))}
                </ul>
                <ShowMoreButton
                  hiddenCount={priorities.underrepresentedGroups.length - UNDERREPRESENTED_DEFAULT_COUNT}
                  expanded={showAllUnderrepresented}
                  onClick={() => setShowAllUnderrepresented((v) => !v)}
                />
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nothing stands out as underrepresented right now.
              </p>
            )}
          </Card>

          <Card tier="primary">
            <CardTitle size="sm" subtitle="Where adding or varying something would help most right now">
              Focus next week
            </CardTitle>
            {priorities.topPriorities.length > 0 ? (
              <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
                {priorities.topPriorities.map((c) => (
                  <RecommendationCard key={c.headline} headline={c.headline} detail={c.detail} action={focusSuggestionText(c)} />
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Your logged diet is well covered right now — nothing specific stands out to prioritize.
              </p>
            )}
          </Card>
        </>
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
        {span && range && (
          <DateRangeFilter span={span} value={range} onChange={setRange} presets={FOOD_DATE_PRESETS} customLabel />
        )}
      </div>

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Distinct ingredients logged in this range">
          Ingredient diversity
        </CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Unique ingredients" value={String(diversity?.current ?? 0)} />
          {diversity?.previous != null ? (
            <StatTile
              label="Vs. prior period"
              value={diversity.current === diversity.previous ? "No change" : diversity.current > diversity.previous ? `+${diversity.current - diversity.previous}` : `${diversity.current - diversity.previous}`}
              detail={`was ${diversity.previous}`}
              accent={diversity.current >= diversity.previous ? "var(--status-good)" : "var(--status-warning)"}
            />
          ) : (
            <StatTile label="Vs. prior period" value="—" detail="not enough earlier history" />
          )}
        </div>
      </Card>

      <Card tier="raw">
        <CardTitle
          size="sm"
          subtitle={isThisWeek ? "What you ate most this week" : "Most frequently tracked foods in this range"}
        >
          Top ingredients
        </CardTitle>
        {topFoods.length > 0 ? (
          <>
            <RankedBarChart data={topFoods} color={TYPE_ACCENT.food} />
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Your top 3 ingredients make up {concentration}% of everything logged in this range.
            </p>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      <Card tier="raw">
        <CardTitle size="sm" subtitle="How often each food group has been logged — counts are logged days, not servings or grams.">
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
          <>
            <MultiLineChart
              data={varietySeries.map((v) => ({ date: v.date, "7-day": v.rolling7dUniqueFoods, "30-day": v.rolling30dUniqueFoods }))}
              series={[
                { key: "7-day", label: "7-day variety", color: "var(--series-1)" },
                { key: "30-day", label: "30-day variety", color: "var(--series-2)" },
              ]}
            />
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              30-day variety is {VARIETY_TREND_LABEL[trendDirection]} compared to the 30 days before that.
            </p>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
        )}
      </Card>

      <RepetitionSection repetition={repetition} expanded={showAllRepetition} onToggle={() => setShowAllRepetition((v) => !v)} />

      <MealTypePatternsSection rows={mealBreakdown} mealInstanceCount={mealInstanceCount} />

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
          <Card tier="raw">
            <CardTitle size="sm" subtitle="Every tracked ingredient in this range, ranked by occurrences">
              All ingredients
            </CardTitle>
            {ranked.length > 0 ? (
              <>
                <RankedBarChart
                  data={(showAllIngredients ? ranked : ranked.slice(0, INGREDIENTS_DEFAULT_COUNT)).map((f) => ({ label: f.item, value: f.count }))}
                  color={TYPE_ACCENT.food}
                />
                <ShowMoreButton
                  hiddenCount={ranked.length - INGREDIENTS_DEFAULT_COUNT}
                  expanded={showAllIngredients}
                  onClick={() => setShowAllIngredients((v) => !v)}
                />
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
            )}
          </Card>
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
        Suggestions combine your logged intake with research-informed evidence, weighted by how well-established
        that evidence is and how well-covered the food group already is in what you&apos;ve logged. Eating an
        evidence-backed food often is never treated as a problem on its own — only actual gaps, or a food dominating
        intake while other food groups are missing, get surfaced. The underlying research is at Manage → Nutrition
        evidence, kept separate from this page. &quot;Not logged&quot; only ever means not logged, never &quot;not
        eaten&quot; — this reflects logging frequency, not quantity or what you actually ate.
      </Methodology>
    </div>
  );
}

const VARIETY_TREND_LABEL: Record<ReturnType<typeof varietyTrendDirection>, string> = {
  increasing: "increasing",
  decreasing: "decreasing",
  stable: "holding steady",
};

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
        subtitle="The exact sets of ingredients logged together most often in the same meal."
      >
        Favorite combinations by meal
      </CardTitle>
      {mealInstanceCount < MIN_MEAL_INSTANCES_FOR_COMBINATIONS ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Not enough meals tagged yet ({mealInstanceCount} logged with a meal tag) — this fills in as you log food
          from the Log page, which always tags a meal.
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

const REPETITION_TAG_LABEL: Record<ReturnType<typeof repetitionInsights>[number]["tag"], string> = {
  beneficial: "Regular & evidence-backed",
  "worth-noting": "Dominant, worth a look",
  neutral: "Regularly eaten",
};
const REPETITION_TAG_COLOR: Record<ReturnType<typeof repetitionInsights>[number]["tag"], string> = {
  beneficial: "var(--status-good)",
  "worth-noting": "var(--status-warning)",
  neutral: "var(--text-muted)",
};

/**
 * Repetition is never itself the problem — a food eaten often that's
 * already evidence-backed and well covered is tagged "beneficial" and
 * described as such, never flagged. Only a dominant food with no such
 * backing, while other core-pillar groups are actually missing, gets
 * "worth-noting" (see repetitionInsights' own doc comment for the exact
 * rule). Everything else is purely descriptive ("neutral").
 */
function RepetitionSection({
  repetition,
  expanded,
  onToggle,
}: {
  repetition: ReturnType<typeof repetitionInsights>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const visible = expanded ? repetition : repetition.slice(0, REPETITION_DEFAULT_COUNT);
  return (
    <Card tier="raw" className="lg:col-span-2">
      <CardTitle size="sm" subtitle="Foods that appear regularly in your meals">
        Repetition
      </CardTitle>
      {repetition.length > 0 ? (
        <>
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
          {visible.map((r) => (
            <li key={r.item} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{r.item}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {r.shareOfOccurrences}% of logged occurrences
                  {r.mealInstanceCount > 0 && ` · in ${r.mealInstanceCount} meal${r.mealInstanceCount === 1 ? "" : "s"}`}
                </span>
              </div>
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                style={{ color: REPETITION_TAG_COLOR[r.tag], background: `color-mix(in oklab, ${REPETITION_TAG_COLOR[r.tag]} 14%, transparent)` }}
              >
                {REPETITION_TAG_LABEL[r.tag]}
              </span>
            </li>
          ))}
        </ul>
        <ShowMoreButton hiddenCount={repetition.length - REPETITION_DEFAULT_COUNT} expanded={expanded} onClick={onToggle} />
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
      )}
    </Card>
  );
}

const MEAL_TAG_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"];

function mealPatternLabel(r: { classification: string; exclusiveMeal: string | null }): string {
  if (r.classification === "exclusive" && r.exclusiveMeal) return `Mostly ${r.exclusiveMeal.toLowerCase()}`;
  if (r.classification === "cross-meal") return "Cross-meal";
  return "Spread out";
}

/**
 * Desktop keeps the compact tinted-cell table (same plain-table idiom as
 * CoverageTableRows). Below `lg`, a 4-column-plus-label table has no room
 * to stay legible without horizontal scroll, so narrow screens get a
 * stacked list instead — one ingredient per row, only its non-zero meals
 * listed inline, same information, no sideways scrolling.
 */
function MealTypePatternsSection({
  rows,
  mealInstanceCount,
}: {
  rows: ReturnType<typeof mealTypeIngredientBreakdown>;
  mealInstanceCount: number;
}) {
  // A top-ranked ingredient can still have zero meal-tagged occurrences
  // (its logs predate the meal-tag field, or were never tagged) — such a
  // row has nothing to show in any meal column, which read as a blank,
  // broken-looking row rather than a real "spread out" pattern. Dropped
  // here rather than displayed with nothing in it.
  const taggedRows = rows.filter((r) => r.total > 0);
  const maxCount = Math.max(1, ...taggedRows.map((r) => Math.max(0, ...Object.values(r.countsByMeal))));

  return (
    <Card tier="raw" className="lg:col-span-2">
      <CardTitle size="sm" subtitle="Which ingredients cluster around one meal vs. show up across several">
        Meal-type patterns
      </CardTitle>
      {mealInstanceCount < MIN_MEAL_INSTANCES_FOR_COMBINATIONS || taggedRows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Not enough meals tagged yet to break this down by meal type.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <th className="pb-2 pr-4 font-medium">Ingredient</th>
                  {MEAL_TAG_ORDER.map((m) => (
                    <th key={m} className="pb-2 pr-3 text-center font-medium">{m}</th>
                  ))}
                  <th className="pb-2 text-right font-medium">Pattern</th>
                </tr>
              </thead>
              <tbody>
                {taggedRows.map((r) => (
                  <tr key={r.item} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{r.item}</td>
                    {MEAL_TAG_ORDER.map((m) => {
                      const count = r.countsByMeal[m] ?? 0;
                      const intensity = count / maxCount;
                      return (
                        <td key={m} className="py-1 pr-3 text-center">
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[11px] tabular-nums"
                            style={{
                              background: count > 0 ? `color-mix(in oklab, ${TYPE_ACCENT.food} ${Math.round(20 + intensity * 55)}%, var(--surface-1))` : "transparent",
                              color: count > 0 ? "#fff" : "var(--text-muted)",
                            }}
                          >
                            {count > 0 ? count : ""}
                          </span>
                        </td>
                      );
                    })}
                    <td className="py-2 text-right text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {mealPatternLabel(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col divide-y lg:hidden" style={{ borderColor: "var(--gridline)" }}>
            {taggedRows.map((r) => {
              const parts = MEAL_TAG_ORDER.filter((m) => (r.countsByMeal[m] ?? 0) > 0).map((m) => `${m} ${r.countsByMeal[m]}`);
              return (
                <li key={r.item} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{r.item}</span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{parts.join(" · ")}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{mealPatternLabel(r)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
