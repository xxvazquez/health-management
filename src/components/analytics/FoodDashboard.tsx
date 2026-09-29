"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ComparisonKey, ComparisonRow, ShowAllRow, SplitStatCard, TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import { Card, CardTitle } from "@/components/ui/Card";
import { TrendsActions } from "@/components/analytics/TrendsActions";
import { DateRangeFilter, type DateRangePreset } from "@/components/ui/DateRangeFilter";
import { Methodology } from "@/components/ui/Methodology";
import { SectionNav, type SectionNavItem } from "@/components/ui/SectionNav";
import { ShowMore } from "@/components/ui/ShowMore";
import { RankedBarChart } from "@/components/charts/RankedBarChart";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { useFoodNutritionGroupOverrides } from "@/lib/useFoodNutritionGroupOverrides";
import { usePreferences } from "@/lib/usePreferences";
import { resolveFoodTargets } from "@/lib/foodTargets";
import { daysBetween } from "@/lib/aggregations/common";
import {
  favoriteCombosByMeal,
  foodCategoryDistribution,
  ingredientDiversity,
  ingredientMealMatrix,
  ingredientRotation,
  mealInstances,
  rankedFoods,
  repetitionInsights,
  type IngredientMealRow,
  type MealComboEntry,
} from "@/lib/aggregations/food";
import {
  computeNutritionPriorities,
  MIN_FOOD_DAYS_FOR_CONFIDENCE,
  type PillarRow as PillarStat,
  type GroupState,
} from "@/lib/aggregations/nutritionPriorities";
import { TYPE_ACCENT, colorForCategorySlot } from "@/taxonomy/categories";
import { TrendHeadline } from "@/components/charts/TrendCard";
import { LabMarkerChart, type LabMarkerChartPoint } from "@/components/charts/LabMarkerChart";
import { formatShortDate } from "@/components/doctors/shared";


/** A food group counts as on target from this share of its weekly target. */
const ON_TARGET_PERCENT = 85;

/** A bar's colour from its share of target, the same number the row shows:
 * on target, close to it, or well short. */
function toneForPercent(percent: number): string {
  if (percent >= ON_TARGET_PERCENT) return "var(--status-good)";
  return percent < 50 ? "var(--status-critical)" : "var(--status-warning)";
}

function pillarTone(row: PillarStat): string {
  return toneForPercent(row.percentOfTarget);
}

/** A food group's weekly rate as a share of its target, 0 when it has none. */
function targetPercent(g: GroupState): number {
  return g.targetPerWeek ? Math.round((g.rateInRangePerWeek / g.targetPerWeek) * 100) : 0;
}

/** Rows "Eaten least" shows before "Show all". */
const EATEN_LEAST_SHORT = 4;

/** How many rows a trimmed Trends list shows before "Show all". */
const SHORT_LIST = 3;






/** Each section's `<h2>` is a landmark but not shown — the SectionNav
 * above already names the current section. A subtitle, where one is given,
 * does render. */
function SectionHeading({ id, subtitle, children }: { id: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <>
      <h2 id={id} className="sr-only">
        {children}
      </h2>
      {subtitle && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
    </>
  );
}

/** One section of the page — only the one matching `activeId` renders, the
 * rest return null (SectionNav switches between them, like the Log tabs). */
function PageSection({ id, activeId, headingLabel, subtitle, children }: {
  id: string;
  activeId: string;
  headingLabel: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  if (id !== activeId) return null;
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <SectionHeading id={`${id}-heading`} subtitle={subtitle}>
        {headingLabel}
      </SectionHeading>
      {children}
    </section>
  );
}

/** 7 days / 2 weeks / 1 month / 6 months / 1 year / All time — Food's
 * own preset wording, distinct from the "Last N days" phrasing every other
 * analytics page still uses (DateRangeFilter's `presets` prop is opt-in
 * precisely so this doesn't change those other pages). Arbitrary custom
 * ranges (3 weeks, 3 months, ...) are already covered by the component's
 * existing manual date inputs — no separate mechanism needed. */
const FOOD_DATE_PRESETS: DateRangePreset[] = [
  { label: "7 days", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "All time", days: "all" },
];

const REPETITION_DEFAULT_COUNT = 10;
const INGREDIENTS_DEFAULT_COUNT = 10;

const SECTION_NAV_ITEMS: SectionNavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "variety", label: "Variety" },
  { id: "repetition", label: "Repetition" },
  { id: "meal-patterns", label: "Meal patterns" },
  { id: "combinations", label: "Combinations" },
  { id: "ingredients", label: "Ingredients" },
];
// Same TYPE_ACCENT.food used by this page's charts, bars, and inner tab
// underline, and by the Log page's own per-type tab bar — one page never
// mixes an arbitrary "page chrome" color in with its actual per-type
// accent, even for a different level of navigation.
const SECTION_NAV_ACCENT = TYPE_ACCENT.food;

const MIN_MEAL_INSTANCES_FOR_COMBINATIONS = 5;
/** Display order only — the combinations themselves are computed entirely
 * from logged meal tags, never assumed. Any meal tag outside this list
 * (there shouldn't be one, since the Log page only offers these four)
 * still renders, just after the known ones. */
const MEAL_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"];

export function FoodDashboard() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const { overrides: nutritionGroupOverrides } = useFoodNutritionGroupOverrides();
  const { prefs } = usePreferences();
  const foodTargetsPref = prefs.foodTargets;
  const foodTargets = useMemo(() => resolveFoodTargets(foodTargetsPref), [foodTargetsPref]);
  // One section at a time, like the Log page — SectionNav swaps which
  // section renders rather than scrolling to it, so reaching "Repetition"
  // or "Ingredients" never means scrolling past everything above.
  const [activeSection, setActiveSection] = useState<string>(SECTION_NAV_ITEMS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showAllRepetition, setShowAllRepetition] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [showAllEatingLess, setShowAllEatingLess] = useState(false);
  const [showAllEatenLeast, setShowAllEatenLeast] = useState(false);
  const [plantScrub, setPlantScrub] = useState<LabMarkerChartPoint | null>(null);

  function selectSection(id: string) {
    setActiveSection(id);
    // Jump straight to the (sticky) section tabs so the new section starts at
    // the top of the viewport — no smooth scroll, which fights the content
    // height changing under it.
    contentRef.current?.scrollIntoView({ block: "start" });
  }

  // Length of the selected range, reused everywhere a label needs to name
  // the exact comparison window instead of a hardcoded number.
  const rangeLengthDays = range ? daysBetween(range.start, range.end) + 1 : 0;

  // Every metric below — including the dietary-pattern synthesis (priorities,
  // coverage, doing-well/missing, pattern, trend, variety) — is scoped to
  // the selected range, so switching the date-range control recalculates
  // everything on this page, not just the charts.
  const priorities = useMemo(
    () => computeNutritionPriorities(events, range ?? null, nutritionGroupOverrides, foodTargets),
    [events, range, nutritionGroupOverrides, foodTargets],
  );
  const rotation = useMemo(
    () => (range ? ingredientRotation(events, range) : { staples: [], fallenOutOfRotation: [], trendAvailable: false }),
    [events, range],
  );

  const distribution = useMemo(() => foodCategoryDistribution(filtered), [filtered]);
  const ranked = useMemo(() => rankedFoods(filtered), [filtered]);
  const mealInstancesList = useMemo(() => mealInstances(filtered), [filtered]);
  const mealInstanceCount = mealInstancesList.length;
  const combos = useMemo(() => favoriteCombosByMeal(mealInstancesList), [mealInstancesList]);
  const diversity = useMemo(() => (range ? ingredientDiversity(filtered, range, events) : null), [filtered, range, events]);
  const hasCoreGaps = priorities.missing.length > 0;
  const repetition = useMemo(
    () => repetitionInsights(ranked, mealInstancesList, priorities.groupStates, hasCoreGaps, 20, nutritionGroupOverrides),
    [ranked, mealInstancesList, priorities.groupStates, hasCoreGaps, nutritionGroupOverrides],
  );
  const mealMatrix = useMemo(() => ingredientMealMatrix(mealInstancesList), [mealInstancesList]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const ingredientDelta =
    diversity && diversity.previous != null && diversity.current !== diversity.previous ? diversity.current - diversity.previous : null;
  const pillarsOnTarget = priorities.pillars.filter((p) => p.percentOfTarget >= ON_TARGET_PERCENT).length;
  const plantsLast30 = priorities.variety.plantSeries.at(-1)?.plants ?? null;
  const plantDelta =
    plantsLast30 != null && priorities.variety.previousPlants30 != null && plantsLast30 !== priorities.variety.previousPlants30
      ? plantsLast30 - priorities.variety.previousPlants30
      : null;
  const plantGroups = [
    { label: "Vegetables", count: priorities.variety.uniqueVegetables, color: colorForCategorySlot("Veggies") },
    { label: "Fruit", count: priorities.variety.uniqueFruit, color: colorForCategorySlot("Fruit") },
    { label: "Nuts & seeds", count: priorities.variety.uniqueNutsSeeds, color: colorForCategorySlot("Nuts & Seeds") },
    { label: "Legumes", count: priorities.variety.uniqueLegumes, color: colorForCategorySlot("Legumes") },
    { label: "Grains", count: priorities.variety.uniqueGrains, color: colorForCategorySlot("Grains") },
  ].sort((a, b) => b.count - a.count);
  const plantGroupsMax = Math.max(1, ...plantGroups.map((g) => g.count));
  const eatenLeast = priorities.groupStates
    .filter((g) => g.targetPerWeek != null && targetPercent(g) < ON_TARGET_PERCENT)
    .sort((a, b) => targetPercent(a) - targetPercent(b));

  return (
    <div className="flex flex-col gap-4">
      {span && range && (
        <TrendsActions>
          <DateRangeFilter span={span} value={range} onChange={setRange} presets={FOOD_DATE_PRESETS} accent={TYPE_ACCENT.food} />
        </TrendsActions>
      )}


      {/* The sticky section tabs and the section they render share one
          parent, so the tabs have room to stay pinned while a long section
          scrolls. `scroll-mt` clears the app header on jump. */}
      <div ref={contentRef} className="flex scroll-mt-16 flex-col gap-2 lg:scroll-mt-8">
      <SectionNav items={SECTION_NAV_ITEMS} activeId={activeSection} onSelect={selectSection} accent={SECTION_NAV_ACCENT} />
      <PageSection id="overview" activeId={activeSection} headingLabel="Overview">
        {priorities.insufficientData ? (
          <Card tier="supporting">
            <CardTitle>Not enough history yet</CardTitle>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Recommendations need at least {MIN_FOOD_DAYS_FOR_CONFIDENCE} days of food history. Pick a longer range, and
              this page fills in.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <SplitStatCard
              items={[
                {
                  caption: "Ingredients",
                  value: String(diversity?.current ?? 0),
                  detail: ingredientDelta != null ? `${ingredientDelta > 0 ? "+" : ""}${ingredientDelta} vs previous ${rangeLengthDays} days` : undefined,
                  detailColor: ingredientDelta != null ? (ingredientDelta > 0 ? "var(--status-good)" : "var(--status-critical)") : undefined,
                },
                { caption: "Groups on target", value: String(pillarsOnTarget), unit: `of ${priorities.pillars.length}`, detail: `${ON_TARGET_PERCENT}% of target or more` },
              ]}
            />

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <TrendGroup
              caption="Per week vs target"
              note={
                <>
                  Targets from{" "}
                  <Link href="/manage/?section=Food%20targets" className="underline" style={{ color: "var(--series-1)" }}>
                    your settings
                  </Link>
                </>
              }
            >
              {priorities.pillars.map((row) => (
                <TrendRow
                  key={row.pillar}
                  label={row.label}
                  value={`${row.rateInRangePerWeek.toFixed(1)} of ${row.targetPerWeek}`}
                  bar={{ pct: row.percentOfTarget, color: pillarTone(row) }}
                />
              ))}
            </TrendGroup>

            {rotation.trendAvailable && rotation.fallenOutOfRotation.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <TrendGroup caption={`Eating less than the previous ${rangeLengthDays} days`}>
                  {(showAllEatingLess ? rotation.fallenOutOfRotation : rotation.fallenOutOfRotation.slice(0, SHORT_LIST)).map((f) => (
                    <ComparisonRow
                      key={f.item}
                      label={f.item}
                      before={f.daysBefore}
                      now={f.daysInRange}
                      max={Math.max(...rotation.fallenOutOfRotation.map((x) => x.daysBefore))}
                      color="var(--status-critical)"
                    />
                  ))}
                  {rotation.fallenOutOfRotation.length > SHORT_LIST && (
                    <ShowAllRow total={rotation.fallenOutOfRotation.length} expanded={showAllEatingLess} onToggle={() => setShowAllEatingLess((v) => !v)} />
                  )}
                </TrendGroup>
                <ComparisonKey color="var(--status-critical)" unit="days" />
              </div>
            )}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection id="variety" activeId={activeSection} headingLabel="Variety">
        {priorities.insufficientData ? null : (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              <TrendHeadline
                caption={plantScrub ? `Plant foods · 30 days to ${formatShortDate(plantScrub.date)}` : "Plant foods · last 30 days"}
                value={String(plantScrub?.value ?? plantsLast30 ?? priorities.variety.uniquePlantFoods)}
                detail={
                  plantDelta != null && !plantScrub ? (
                    <span style={{ color: plantDelta >= 0 ? "var(--status-good)" : "var(--status-serious)" }}>
                      {plantDelta > 0 ? "+" : ""}
                      {plantDelta} vs previous 30 days
                    </span>
                  ) : undefined
                }
              />
              {priorities.variety.plantSeries.length > 1 && (
                <div className="mt-2">
                  <LabMarkerChart
                    data={priorities.variety.plantSeries.map((p) => ({ date: p.date, value: p.plants }))}
                    unit={null}
                    refLow={null}
                    refHigh={null}
                    windowStart={range?.start ?? null}
                    windowEnd={range?.end ?? null}
                    color="var(--series-1)"
                    onScrub={setPlantScrub}
                    height={170}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <TrendGroup caption="Different plant foods by group">
                {plantGroups.map((g) => (
                  <TrendRow key={g.label} label={g.label} value={g.count} bar={{ pct: (g.count / plantGroupsMax) * 100, color: g.color }} />
                ))}
              </TrendGroup>

              {eatenLeast.length > 0 && (
                <TrendGroup caption="Eaten least · per week vs target">
                  {(showAllEatenLeast ? eatenLeast : eatenLeast.slice(0, EATEN_LEAST_SHORT)).map((g) => (
                    <TrendRow
                      key={g.group}
                      label={g.label}
                      value={`${g.rateInRangePerWeek.toFixed(1)} of ${g.targetPerWeek}`}
                      bar={{ pct: targetPercent(g), color: toneForPercent(targetPercent(g)) }}
                    />
                  ))}
                  {eatenLeast.length > EATEN_LEAST_SHORT && (
                    <ShowAllRow total={eatenLeast.length} expanded={showAllEatenLeast} onToggle={() => setShowAllEatenLeast((v) => !v)} />
                  )}
                </TrendGroup>
              )}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection id="repetition" activeId={activeSection} headingLabel="Repetition">
        <RepetitionSection repetition={repetition} expanded={showAllRepetition} onToggle={() => setShowAllRepetition((v) => !v)} />
      </PageSection>

      <PageSection id="meal-patterns" activeId={activeSection} headingLabel="Meal patterns">
        <MealTypePatternsSection matrix={mealMatrix} mealInstanceCount={mealInstanceCount} />
      </PageSection>

      <PageSection id="combinations" activeId={activeSection} headingLabel="Combinations">
        <FavoriteCombosByMeal combos={combos} mealInstanceCount={mealInstanceCount} />
      </PageSection>

      <PageSection id="ingredients" activeId={activeSection} headingLabel="Ingredients">
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
              <ShowMore className="mt-2"
                hiddenCount={ranked.length - INGREDIENTS_DEFAULT_COUNT}
                expanded={showAllIngredients}
                onClick={() => setShowAllIngredients((v) => !v)}
              />
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>

        <Card tier="raw">
          <CardTitle size="sm" subtitle="Every broad food category, ranked by tracked occurrences in this range">
            Category distribution
          </CardTitle>
          <RankedBarChart data={distribution.map((d) => ({ label: d.category, value: d.count }))} color={TYPE_ACCENT.food} />
        </Card>

        {!priorities.insufficientData && priorities.trend.available && <TrendSection trend={priorities.trend} />}
      </PageSection>
      </div>

      <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--gridline)" }}>
        <Methodology>
          Suggestions combine your logged intake with research-informed evidence, weighted by how well-established
          that evidence is and how well-covered the food group already is in what you&apos;ve logged. Eating an
          evidence-backed food often is never treated as a problem on its own — only actual gaps, or a food dominating
          intake while other food groups are missing, get surfaced. The underlying research is on the Nutrition
          evidence page (linked from Settings), kept separate from this page. &quot;Not logged&quot; only ever means not logged, never &quot;not
          eaten&quot; — this reflects logging frequency, not quantity or what you actually ate.
        </Methodology>
      </div>
    </div>
  );
}



function TrendSection({ trend }: { trend: ReturnType<typeof computeNutritionPriorities>["trend"] }) {
  return (
    <Card tier="raw">
      <CardTitle size="sm" subtitle={`Selected range vs. the ${trend.rangeLengthDays}-day period immediately before it`}>
        Over time
      </CardTitle>
      <ul className="flex flex-col inset-rows">
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
    <Card tier="raw">
      <CardTitle
        size="sm"
        subtitle="Ingredients you most often have together in the same meal — anything else in that meal doesn't matter."
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
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {orderedTags.map((mealTag) => {
            const mealCombos = combos.filter((c) => c.mealTag === mealTag).slice(0, 5);
            return (
              <section key={mealTag} className="flex min-w-0 flex-col gap-1">
                <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  {mealTag}
                </h3>
                {mealCombos.length === 0 ? (
                  <p className="py-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    No repeated combination yet.
                  </p>
                ) : (
                  <ul className="inset-rows">
                    {mealCombos.map((c) => (
                      <li key={c.items.join("+")} className="flex min-h-11 items-center justify-between gap-4 py-2">
                        <span className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
                          {c.items.join(" + ")}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {c.count}×
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// A verdict on the repetition itself, not on group coverage — kept clear
// of the "Underrepresented / Well represented" vocabulary the coverage
// pills use, since a repeated food and a covered food group aren't the
// same axis.
const REPETITION_TAG_LABEL: Record<ReturnType<typeof repetitionInsights>[number]["tag"], string> = {
  beneficial: "Fine to repeat",
  "worth-noting": "Worth a look",
  neutral: "Frequent",
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
    <Card tier="raw">
      <CardTitle size="sm" subtitle="Foods that appear regularly in your meals">
        Repetition
      </CardTitle>
      {repetition.length > 0 ? (
        <>
        <ul className="flex flex-col inset-rows">
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
                className="shrink-0 text-xs font-medium whitespace-nowrap"
                style={{ color: REPETITION_TAG_COLOR[r.tag] }}
              >
                {REPETITION_TAG_LABEL[r.tag]}
              </span>
            </li>
          ))}
        </ul>
        <ShowMore className="mt-2" hiddenCount={repetition.length - REPETITION_DEFAULT_COUNT} expanded={expanded} onClick={onToggle} />
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
      )}
    </Card>
  );
}

const MEAL_TAG_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"];

/** One muted hue per meal — the tones settled on in design review:
 * breakfast blue, lunch green, dinner navy-indigo, snack plum. Drawn from
 * the shared series tokens so they track the light/dark theme. */
const MEAL_HUE: Record<string, string> = {
  Breakfast: "var(--series-2)",
  Lunch: "var(--series-1)",
  Dinner: "var(--series-indigo)",
  Snack: "var(--series-8)",
};

// Four discrete tint steps → % of the meal hue mixed into the surface.
const MEAL_TINT_STEP = [7, 13, 21, 31];
const mealTintStep = (n: number) => (n <= 3 ? 0 : n <= 7 ? 1 : n <= 10 ? 2 : 3);

const MEAL_GRID = "minmax(5rem, 7rem) repeat(4, minmax(0, 1fr)) 2.5rem";

function MealHeatCell({ count, meal }: { count: number; meal: string }) {
  if (count === 0) return <span />;
  const hue = MEAL_HUE[meal] ?? "var(--series-slate)";
  return (
    <span
      className="mx-0.5 flex h-[30px] items-center justify-center rounded-lg text-xs font-medium tabular-nums"
      style={{
        background: `color-mix(in oklab, ${hue} ${MEAL_TINT_STEP[mealTintStep(count)]}%, var(--surface-1))`,
        color: `color-mix(in oklab, ${hue} 78%, var(--text-primary))`,
      }}
    >
      {count}
    </span>
  );
}

/**
 * The "By meal" heatmap — one dense row per ingredient. The name is
 * right-aligned against four wide meal cells that nearly touch; a filled
 * cell is a soft tint of the meal's colour (four steps by frequency), an
 * empty cell is nothing. Colour and column both say which meal.
 */
function MealTypePatternsSection({
  matrix,
  mealInstanceCount,
}: {
  matrix: IngredientMealRow[];
  mealInstanceCount: number;
}) {
  return (
    <Card tier="raw">
      <CardTitle size="sm" subtitle="Where each ingredient shows up — colour and column are the meal">
        By meal
      </CardTitle>
      {mealInstanceCount < MIN_MEAL_INSTANCES_FOR_COMBINATIONS || matrix.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Not enough meals tagged yet to break this down by meal.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[19rem] max-w-[40rem]">
            {/* On a phone the columns are too narrow for the meal names, so
                the header shows each meal's colour and this line names them. */}
            <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs sm:hidden" style={{ color: "var(--text-secondary)" }}>
              {MEAL_TAG_ORDER.map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: MEAL_HUE[m] ?? "var(--series-slate)" }} aria-hidden="true" />
                  {m}
                </span>
              ))}
            </p>
            <div
              className="grid items-end border-b pb-1.5 text-xs"
              style={{ gridTemplateColumns: MEAL_GRID, borderColor: "var(--gridline)", color: "var(--text-muted)" }}
            >
              <span />
              {MEAL_TAG_ORDER.map((m) => (
                <span key={m} className="flex justify-center">
                  <span className="h-2 w-2 rounded-full sm:hidden" style={{ background: MEAL_HUE[m] ?? "var(--series-slate)" }} aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{m}</span>
                </span>
              ))}
              <span className="text-right">Total</span>
            </div>
            {matrix.map((r, i) => (
              <div
                key={r.item}
                className="grid items-center py-1"
                style={{
                  gridTemplateColumns: MEAL_GRID,
                  borderBottom: i < matrix.length - 1 ? "1px solid var(--border-hairline)" : undefined,
                }}
              >
                <span className="truncate pr-2 text-right text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {r.item}
                </span>
                {MEAL_TAG_ORDER.map((m) => (
                  <MealHeatCell key={m} count={r.countsByMeal[m] ?? 0} meal={m} />
                ))}
                <span className="text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
