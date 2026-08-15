"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { computeLaggedAssociations, generateTopPatterns, matchCategory, matchItem } from "@/lib/aggregations/patterns";
import { rankedFoods, foodCategoryDistribution } from "@/lib/aggregations/food";
import { supplementStats } from "@/lib/aggregations/supplements";
import { generateInsights, trackingCoverageSummary } from "@/lib/aggregations/recommendations";
import type { CanonicalEvent } from "@/lib/types";

function lagDayLabel(lagDays: number): string {
  return lagDays === 1 ? "1 day" : `${lagDays} days`;
}

/** "the same day as X" / "the day after X" / "2 days after X" */
function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return "the same day as";
  if (lagDays === 1) return "the day after";
  return `${lagDays} days after`;
}

export default function PatternsPage() {
  const { status, events } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);

  const topPatterns = useMemo(() => generateTopPatterns(filtered), [filtered]);
  const insights = useMemo(() => generateInsights(filtered), [filtered]);
  const coverage = useMemo(() => trackingCoverageSummary(filtered), [filtered]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Patterns
          </h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-secondary)" }}>
            Descriptive statistics only — never causal claims. Every comparison shows its sample size;
            associations below a minimum sample size are hidden rather than shown with false confidence.
          </p>
        </div>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      {coverage && (
        <Card>
          <CardTitle>Tracking coverage</CardTitle>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {coverage.totalTrackedDays} of {coverage.totalCalendarDays} days in this range have at least
            one entry ({coverage.coveragePct}%). The {coverage.gapDays} day{coverage.gapDays === 1 ? "" : "s"} with
            nothing logged are treated as <strong>not tracked</strong>, never as &quot;nothing happened&quot; —
            they&apos;re excluded from every percentage on this page.
          </p>
        </Card>
      )}

      <Card>
        <CardTitle subtitle="Association only, never cause-and-effect. Each pair shows whichever of 4 lags (same day to +3 days) has the strongest signal — with more comparisons checked, a strong-looking gap is more likely to be noise, especially at small sample sizes.">
          Notable associations
        </CardTitle>
        {topPatterns.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {topPatterns.map((p, i) => (
              <div key={i} className="rounded-lg border p-4" style={{ borderColor: "var(--gridline)" }}>
                <p className="mb-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {p.outcomeLabel}{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    {p.diffPct > 0 ? "occurred more often" : "occurred less often"}
                  </span>{" "}
                  {lagPhrase(p.lagDays)} {p.causeLabel}
                </p>
                <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.lagDays === 0 ? "Same day as" : `${lagDayLabel(p.lagDays)} after`} {p.causeLabel.toLowerCase()}
                </p>
                <ComparisonBars
                  withLabel={`With ${p.causeLabel}`}
                  withPct={p.withPct}
                  withCount={p.withCount}
                  withTotal={p.withTotal}
                  withoutLabel={`Without ${p.causeLabel}`}
                  withoutPct={p.withoutPct}
                  withoutCount={p.withoutCount}
                  withoutTotal={p.withoutTotal}
                />
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Based on {p.withTotal + p.withoutTotal} days where {p.outcomeLabel.toLowerCase()} tracking exists.
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Not enough data yet to surface a reliable association (each comparison needs at least 5 tracked
            days on both sides, at every lag checked).
          </p>
        )}
      </Card>

      <LagExplorer events={filtered} />

      <Card>
        <CardTitle subtitle="Observed facts, a cautious reading, and — only when well supported — a suggestion. Never a nutritional prescription.">
          What might be worth adjusting?
        </CardTitle>
        {insights.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {insights.map((insight, i) => (
              <li key={i} className="rounded-lg border p-4" style={{ borderColor: "var(--gridline)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {insight.title}
                </p>
                <dl className="mt-2 flex flex-col gap-1.5 text-xs">
                  <div>
                    <dt className="inline font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Observed:{" "}
                    </dt>
                    <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                      {insight.observed}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Possible interpretation:{" "}
                    </dt>
                    <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                      {insight.interpretation}
                    </dd>
                  </div>
                  {insight.recommendation && (
                    <div>
                      <dt className="inline font-semibold" style={{ color: "var(--status-good)" }}>
                        Recommendation:{" "}
                      </dt>
                      <dd className="inline" style={{ color: "var(--text-secondary)" }}>
                        {insight.recommendation}
                      </dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing notable to flag right now.</p>
        )}
      </Card>
    </div>
  );
}

function LagExplorer({ events }: { events: CanonicalEvent[] }) {
  const causeOptions = useMemo(() => {
    const foods = rankedFoods(events)
      .slice(0, 15)
      .map((f) => ({ label: `Food: ${f.item}`, value: `item:${f.item}` }));
    const categories = foodCategoryDistribution(events)
      .filter((c) => c.count > 0)
      .map((c) => ({ label: `Category: ${c.category}`, value: `category:${c.category}` }));
    const supplements = supplementStats(events).map((s) => ({ label: `Supplement: ${s.item}`, value: `item:${s.item}` }));
    return [...foods, ...categories, ...supplements];
  }, [events]);

  const outcomeOptions = useMemo(() => {
    const items = Array.from(
      new Set(events.filter((e) => e.itemType === "outcome").map((e) => e.item)),
    );
    return items.map((item) => ({ label: item, value: item }));
  }, [events]);

  const [cause, setCause] = useState(causeOptions[0]?.value ?? "");
  const [outcome, setOutcome] = useState(outcomeOptions[0]?.value ?? "");

  const effectiveCause = cause || causeOptions[0]?.value || "";
  const effectiveOutcome = outcome || outcomeOptions[0]?.value || "";

  const results = useMemo(() => {
    if (!effectiveCause || !effectiveOutcome) return [];
    const [kind, ...rest] = effectiveCause.split(":");
    const value = rest.join(":");
    const causeMatcher = kind === "category" ? matchCategory(value) : matchItem(value);
    const outcomeMatcher = matchItem(effectiveOutcome);
    return computeLaggedAssociations(events, causeMatcher, outcomeMatcher, [0, 1, 2, 3]);
  }, [events, effectiveCause, effectiveOutcome]);

  if (causeOptions.length === 0 || outcomeOptions.length === 0) return null;

  return (
    <Card>
      <CardTitle subtitle="Does the association get stronger if the outcome is measured 1–3 days after the cause instead of the same day?">
        Time-lag explorer
      </CardTitle>
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={effectiveCause}
          onChange={(e) => setCause(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        >
          {causeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="self-center text-sm" style={{ color: "var(--text-muted)" }}>
          →
        </span>
        <select
          value={effectiveOutcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        >
          {outcomeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {results.map((r) => (
          <div key={r.lagDays} className="rounded-lg border p-3" style={{ borderColor: "var(--gridline)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {r.lagDays === 0 ? "Same day" : `+${r.lagDays} day${r.lagDays > 1 ? "s" : ""} later`}
            </p>
            {r.sampleSizeAdequate ? (
              <>
                <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {r.diffPct > 0 ? "+" : ""}
                  {r.diffPct}pp
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {r.withPct}% with ({r.withCount}/{r.withTotal}) vs {r.withoutPct}% without ({r.withoutCount}/
                  {r.withoutTotal})
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Not enough data ({r.withTotal + r.withoutTotal} days)
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
