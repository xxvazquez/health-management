"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Insight } from "@/components/ui/Insight";
import { Card, CardTitle } from "@/components/ui/Card";
import { BulletList } from "@/components/ui/BulletList";
import { DateRangeFilter, type DateRangePreset } from "@/components/ui/DateRangeFilter";
import { Methodology } from "@/components/ui/Methodology";
import { SectionNav, type SectionNavItem } from "@/components/ui/SectionNav";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
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
  varietyTrendDirection,
  type MealComboEntry,
  type VarietyTrendDirection,
} from "@/lib/aggregations/food";
import {
  computeNutritionPriorities,
  type CoverageRow,
  type GroupStatus,
  type DietBalanceStatus,
} from "@/lib/aggregations/nutritionPriorities";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const STATUS_COLOR: Record<GroupStatus, string> = {
  "not-enough-data": "var(--text-muted)",
  priority: "var(--status-warning)",
  increase: "var(--series-4)",
  good: "var(--series-1)",
  strong: "var(--status-good)",
};

// Same severity ramp as STATUS_COLOR above, applied to the coarser
// per-pillar diet-balance verdict shown on Overview.
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
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color, background: color === "var(--text-muted)" ? "var(--page-plane)" : `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      {label}
    </span>
  );
}

/** Uniform heading for each of the page's 6 top-level sections — same small
 * uppercase-eyebrow treatment this page already used for its old "Evidence"/
 * "Investigate" dividers, now applied consistently everywhere instead of
 * only in two spots. A real `<h2>` (not a styled `<p>`) so SectionNav's
 * targets are proper landmarks, not just visual labels. */
function SectionHeading({ id, subtitle, children }: { id: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h2 id={id} className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        {children}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** One section of the (now single, scrolling) page. `scroll-mt` keeps the
 * heading clear of the sticky SectionNav when you jump to it. */
function PageSection({ id, headingLabel, subtitle, children }: {
  id: string;
  headingLabel: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-28 flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0 lg:scroll-mt-8"
      style={{ borderColor: "var(--gridline)" }}
    >
      <SectionHeading id={`${id}-heading`} subtitle={subtitle}>
        {headingLabel}
      </SectionHeading>
      {children}
    </section>
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

/** Purely descriptive — an arrow and a word, never a value judgment.
 * Repeating the same foods is fine, so "decreasing" gets no warning color;
 * all three states share the same neutral treatment. */
const TREND_DISPLAY: Record<VarietyTrendDirection, { label: string; arrow: string }> = {
  increasing: { label: "Increasing", arrow: "↑" },
  decreasing: { label: "Decreasing", arrow: "↓" },
  stable: { label: "Stable", arrow: "→" },
};

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
  // The page is one scroll now, not one-section-at-a-time. `activeSection`
  // just tracks which heading is in view so SectionNav can highlight it and
  // act as a jump-to.
  const [activeSection, setActiveSection] = useState<string>(SECTION_NAV_ITEMS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showAllRepetition, setShowAllRepetition] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const sections = SECTION_NAV_ITEMS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-12% 0px -78% 0px" },
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [status]);

  function jumpToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Length of the selected range, reused everywhere a label needs to name
  // the exact comparison window instead of a hardcoded number.
  const rangeLengthDays = range ? daysBetween(range.start, range.end) + 1 : 0;
  // Wording only ("this week" vs. the generic phrasing) — any 7-day-long
  // range reads as "this week" regardless of which control produced it
  // (the This-week preset or a manually picked 7-day custom range).
  const isThisWeek = rangeLengthDays === 7;

  // Every metric below — including the dietary-pattern synthesis (priorities,
  // coverage, doing-well/missing, pattern, trend, variety) — is scoped to
  // the selected range, so switching the date-range control recalculates
  // everything on this page, not just the charts.
  const priorities = useMemo(() => computeNutritionPriorities(events, range ?? null), [events, range]);

  const distribution = useMemo(() => foodCategoryDistribution(filtered), [filtered]);
  const varietySeries = useMemo(() => foodVarietyOverTime(filtered), [filtered]);
  const ranked = useMemo(() => rankedFoods(filtered), [filtered]);
  const mealInstancesList = useMemo(() => mealInstances(filtered), [filtered]);
  const mealInstanceCount = mealInstancesList.length;
  const combos = useMemo(() => favoriteCombosByMeal(mealInstancesList), [mealInstancesList]);
  const diversity = useMemo(() => (range ? ingredientDiversity(filtered, range, events) : null), [filtered, range, events]);
  // Increasing/decreasing/stable straight off the same current-vs-prior-
  // range comparison the Variety section's own "Vs. previous N days" tile
  // shows — one trend definition on this page, not a second one derived a
  // different way (see the doc comment on varietyTrendDirection below).
  const diversityTrend: VarietyTrendDirection | null = useMemo(() => {
    if (!diversity || diversity.previous == null) return null;
    if (diversity.current === diversity.previous) return "stable";
    return diversity.current > diversity.previous ? "increasing" : "decreasing";
  }, [diversity]);
  const hasCoreGaps = priorities.missing.length > 0;
  const repetition = useMemo(
    () => repetitionInsights(ranked, mealInstancesList, priorities.groupStates, hasCoreGaps, 20),
    [ranked, mealInstancesList, priorities.groupStates, hasCoreGaps],
  );
  const mealBreakdown = useMemo(
    () => mealTypeIngredientBreakdown(mealInstancesList, ranked.slice(0, 8).map((r) => r.item)),
    [mealInstancesList, ranked],
  );
  // Chart-local trend (rolling-30-day line, recent stretch vs. the stretch
  // before it) — describes the shape of the "Ingredient variety over time"
  // chart specifically, distinct from diversityTrend above.
  const trendDirection = useMemo(() => varietyTrendDirection(varietySeries), [varietySeries]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const topFoods = ranked.slice(0, 10).map((f) => ({ label: f.item, value: f.count }));

  const rangeLabel = span && range ? (range.start === span.start && range.end === span.end ? "all time" : `${range.start} – ${range.end}`) : "";

  const gaps = priorities.missing.map((b) => b.label);
  const foodInsight = priorities.insufficientData
    ? {
        label: "Food",
        headline: `Only ${priorities.daysWithFoodTracked} day${priorities.daysWithFoodTracked === 1 ? "" : "s"} of food logged in this range.`,
        detail: "Widen the range or keep logging, and this page's recommendations fill in.",
        tone: "neutral" as const,
      }
    : gaps.length > 0
      ? {
          label: "Worth noticing",
          headline: `${gaps.slice(0, 2).join(" and ")} could use more attention this range.`,
          detail: gaps.length > 2 ? `Plus ${gaps.length - 2} more in "What you're missing" below.` : null,
          tone: "attention" as const,
        }
      : {
          label: "Going well",
          headline: "Your intake looks balanced across the tracked food groups this range.",
          detail: priorities.doingWell.length > 0 ? `${priorities.doingWell.slice(0, 2).map((b) => b.label).join(" and ")} especially.` : null,
          tone: "good" as const,
        };

  return (
    <div ref={contentRef} className="flex flex-col gap-2">
      <div>
        <DashboardHeader accent={TYPE_ACCENT.food}>Food</DashboardHeader>
      </div>

      {span && range && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Showing <span style={{ color: "var(--text-secondary)" }}>{rangeLabel}</span> — every metric and chart below is
            calculated for this range
          </p>
          <DateRangeFilter span={span} value={range} onChange={setRange} presets={FOOD_DATE_PRESETS} customLabel accent={TYPE_ACCENT.food} />
        </div>
      )}

      <div className="mt-3">
        <Insight label={foodInsight.label} headline={foodInsight.headline} detail={foodInsight.detail} tone={foodInsight.tone} />
      </div>

      <div className="mt-3">
        <SectionNav items={SECTION_NAV_ITEMS} activeId={activeSection} onSelect={jumpToSection} accent={SECTION_NAV_ACCENT} />
      </div>

      <div className="flex flex-col gap-2">
      <PageSection id="overview" headingLabel="Overview">
        {priorities.insufficientData ? (
          <Card tier="supporting">
            <CardTitle subtitle="This page needs a bit more logged history before its recommendations are trustworthy.">
              Not enough data yet
            </CardTitle>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Only {priorities.daysWithFoodTracked} day{priorities.daysWithFoodTracked === 1 ? "" : "s"} with food
              logged in this range. Widen the range or keep logging on the Log page and this page fills in.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Ingredients"
                value={String(priorities.variety.totalUniqueFoods)}
                detail="unique in range"
                accent={TYPE_ACCENT.food}
              />
              <StatTile
                label="Variety trend"
                value={diversityTrend ? `${TREND_DISPLAY[diversityTrend].arrow} ${TREND_DISPLAY[diversityTrend].label}` : "—"}
                detail={diversityTrend ? `vs. previous ${rangeLengthDays} days` : "not enough earlier history"}
              />
            </div>

            <Card tier="raw">
              <CardTitle size="sm" subtitle="How consistently each food group shows up in what you log">
                Diet balance
              </CardTitle>
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {priorities.dietBalance.map((row) => (
                  <div key={row.pillar} className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {row.label}
                    </span>
                    <StatusPill status={row.status} label={row.statusLabel} color={DIET_BALANCE_COLOR[row.status]} />
                  </div>
                ))}
              </div>
            </Card>

            {/* Same "raw" card tier as Diet balance above, so all three
             * Overview cards read as one coherent set rather than a
             * structured summary sitting above two loose lists. */}
            <div className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-2">
              <Card tier="raw">
                <BulletList
                  title="Going well"
                  tone="var(--status-good)"
                  bullets={priorities.doingWell.slice(0, 5)}
                  emptyText="Nothing stands out as strongly consistent yet."
                />
              </Card>
              <Card tier="raw">
                <BulletList
                  title="Worth noticing"
                  tone="var(--status-warning)"
                  bullets={priorities.missing.slice(0, 5)}
                  emptyText="Nothing appears unusually infrequent right now."
                />
              </Card>
            </div>
          </>
        )}
      </PageSection>

      <PageSection id="variety" headingLabel="Variety">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <Card tier="raw">
            <CardTitle size="sm" subtitle="Distinct ingredients logged in this range">
              Ingredient diversity
            </CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Unique ingredients" value={String(diversity?.current ?? 0)} />
              {diversity?.previous != null ? (
                <StatTile
                  label={`Vs. previous ${rangeLengthDays} days`}
                  value={diversity.current === diversity.previous ? "No change" : diversity.current > diversity.previous ? `+${diversity.current - diversity.previous}` : `${diversity.current - diversity.previous}`}
                  detail={`was ${diversity.previous}`}
                  accent={diversity.current >= diversity.previous ? "var(--status-good)" : "var(--status-warning)"}
                />
              ) : (
                <StatTile label={`Vs. previous ${rangeLengthDays} days`} value="—" detail="not enough earlier history" />
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
              <RankedBarChart data={topFoods} color={TYPE_ACCENT.food} />
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
            )}
          </Card>
        </div>

        <Card tier="raw">
          <CardTitle size="sm" subtitle="Days logged in this range, per food group — not servings or grams.">
            Food-group coverage
          </CardTitle>
          {priorities.coverageTable.length > 0 ? (
            <CoverageTableRows rows={priorities.coverageTable} rangeLengthDays={rangeLengthDays} />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough data yet.</p>
          )}
        </Card>

        <Card tier="raw">
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
                height={280}
              />
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                30-day variety is {VARIETY_TREND_LABEL[trendDirection]} compared to the 30 days before that.
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data.</p>
          )}
        </Card>
      </PageSection>

      <PageSection id="repetition" headingLabel="Repetition">
        <RepetitionSection repetition={repetition} expanded={showAllRepetition} onToggle={() => setShowAllRepetition((v) => !v)} />
      </PageSection>

      <PageSection id="meal-patterns" headingLabel="Meal patterns">
        <MealTypePatternsSection rows={mealBreakdown} mealInstanceCount={mealInstanceCount} />
      </PageSection>

      <PageSection id="combinations" headingLabel="Combinations">
        <FavoriteCombosByMeal combos={combos} mealInstanceCount={mealInstanceCount} />
      </PageSection>

      <PageSection id="ingredients" headingLabel="Ingredients">
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

        <Card tier="raw">
          <CardTitle size="sm" subtitle="Every broad food category, ranked by tracked occurrences in this range">
            Category distribution
          </CardTitle>
          <RankedBarChart data={distribution.map((d) => ({ label: d.category, value: d.count }))} color={TYPE_ACCENT.food} />
        </Card>

        {!priorities.insufficientData && (
          <>
            {priorities.trend.available && <TrendSection trend={priorities.trend} />}
            <VarietySection variety={priorities.variety} />
          </>
        )}
      </PageSection>
      </div>

      <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--gridline)" }}>
        <Methodology>
          Suggestions combine your logged intake with research-informed evidence, weighted by how well-established
          that evidence is and how well-covered the food group already is in what you&apos;ve logged. Eating an
          evidence-backed food often is never treated as a problem on its own — only actual gaps, or a food dominating
          intake while other food groups are missing, get surfaced. The underlying research is at Manage → Nutrition
          evidence, kept separate from this page. &quot;Not logged&quot; only ever means not logged, never &quot;not
          eaten&quot; — this reflects logging frequency, not quantity or what you actually ate.
        </Methodology>
      </div>
    </div>
  );
}

const VARIETY_TREND_LABEL: Record<ReturnType<typeof varietyTrendDirection>, string> = {
  increasing: "increasing",
  decreasing: "decreasing",
  stable: "holding steady",
};

function CoverageTableRows({ rows, rangeLengthDays }: { rows: CoverageRow[]; rangeLengthDays: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            <th className="pb-2 pr-8 font-medium">Food group</th>
            <th className="pb-2 pr-5 text-right font-medium">Days in range</th>
            <th className="pb-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t whitespace-nowrap" style={{ borderColor: "var(--gridline)" }}>
              <td className="py-2 pr-8" style={{ color: "var(--text-primary)" }}>{r.label}</td>
              <td className="py-2 pr-5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                {r.daysInRange} / {rangeLengthDays}
              </td>
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
      <CardTitle size="sm" subtitle="Distinct foods logged in the selected range">
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
      <CardTitle size="sm" subtitle={`Selected range vs. the ${trend.rangeLengthDays}-day period immediately before it`}>
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
    <Card tier="raw">
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
    <Card tier="raw">
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
                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
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
    <Card tier="raw">
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
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-xs font-medium tabular-nums"
                            style={{
                              // Dark ink throughout, not white — this tint
                              // range (15-55% of series-1 into white) never
                              // gets dark enough for white text to clear
                              // WCAG's 4.5:1 (it measured as low as 1.35:1
                              // at the pale end with the old 20-75%/white
                              // combo); text-primary stays comfortably
                              // readable across the whole range instead.
                              background: count > 0 ? `color-mix(in oklab, ${TYPE_ACCENT.food} ${Math.round(15 + intensity * 40)}%, var(--surface-1))` : "transparent",
                              color: count > 0 ? "var(--text-primary)" : "var(--text-muted)",
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
