"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import {
  allCauseOptions,
  computeLaggedAssociations,
  generateTopPatterns,
  lowSymptomAssociationFoods,
  matchItem,
  MULTIPLE_COMPARISONS_NOTE,
  SAMPLE_TIER_EXPLANATION,
  SAMPLE_TIER_LABEL,
  type SampleTier,
} from "@/lib/aggregations/patterns";
import { generateInsights, trackingCoverageSummary } from "@/lib/aggregations/recommendations";
import type { CanonicalEvent } from "@/lib/types";

const SAMPLE_TIER_COLOR: Record<SampleTier, string> = {
  insufficient: "var(--text-muted)",
  exploratory: "var(--status-warning)",
  moderate: "var(--series-1)",
  strong: "var(--status-good)",
};

function SampleTierBadge({ tier }: { tier: SampleTier }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ color: SAMPLE_TIER_COLOR[tier], background: "var(--page-plane)" }}
      title={SAMPLE_TIER_EXPLANATION[tier]}
    >
      {SAMPLE_TIER_LABEL[tier]}
    </span>
  );
}

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
            Descriptive statistics only — never causal claims. Every comparison shows its sample size and a
            confidence tier (exploratory / moderate / stronger); anything below 10 exposed days is hidden
            rather than shown with false confidence.
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
        <CardTitle subtitle="Association only, never cause-and-effect. Each pair shows whichever of 4 lags (same day to +3 days) has the strongest signal.">
          Notable associations
        </CardTitle>
        <p className="mb-4 rounded-md border p-3 text-xs" style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}>
          {MULTIPLE_COMPARISONS_NOTE}
        </p>
        {topPatterns.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {topPatterns.map((p, i) => (
              <div key={i} className="rounded-lg border p-4" style={{ borderColor: "var(--gridline)" }}>
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
                <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.lagDays === 0 ? "Same day as" : `${lagDayLabel(p.lagDays)} after`} {p.causeLabel.toLowerCase()} —
                  observed association, not evidence that {p.causeLabel.toLowerCase()} caused this.
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
            Not enough data yet to surface a reliable association (each comparison needs at least 10 exposed
            days and 5 unexposed days, at every lag checked).
          </p>
        )}
      </Card>

      <LagExplorer events={filtered} />

      <ToleratedFoods events={filtered} />

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
  const causeOptions = useMemo(() => allCauseOptions(events), [events]);

  const outcomeOptions = useMemo(() => {
    const items = Array.from(
      new Set(events.filter((e) => e.itemType === "outcome").map((e) => e.item)),
    );
    return items.map((item) => ({ label: item, value: item }));
  }, [events]);

  const [cause, setCause] = useState(causeOptions[0]?.label ?? "");
  const [outcome, setOutcome] = useState(outcomeOptions[0]?.value ?? "");

  const effectiveCause = cause || causeOptions[0]?.label || "";
  const effectiveOutcome = outcome || outcomeOptions[0]?.value || "";

  const results = useMemo(() => {
    if (!effectiveCause || !effectiveOutcome) return [];
    const causeOption = causeOptions.find((o) => o.label === effectiveCause);
    if (!causeOption) return [];
    const outcomeMatcher = matchItem(effectiveOutcome);
    return computeLaggedAssociations(events, causeOption.matcher, outcomeMatcher, [0, 1, 2, 3]);
  }, [events, causeOptions, effectiveCause, effectiveOutcome]);

  if (causeOptions.length === 0 || outcomeOptions.length === 0) return null;

  return (
    <Card>
      <CardTitle subtitle="Does the association get stronger if the outcome is measured 1–3 days after the cause instead of the same day? Includes exercise/movement habits, so you can check whether activity relates to symptoms too.">
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
            <option key={o.label} value={o.label}>
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {r.lagDays === 0 ? "Same day" : `+${r.lagDays} day${r.lagDays > 1 ? "s" : ""} later`}
              </p>
              <SampleTierBadge tier={r.sampleTier} />
            </div>
            {r.sampleTier !== "insufficient" ? (
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

function ToleratedFoods({ events }: { events: CanonicalEvent[] }) {
  const foods = useMemo(() => lowSymptomAssociationFoods(events), [events]);

  return (
    <Card>
      <CardTitle subtitle="Foods eaten on at least 20 tracked days where no tracked digestive symptom shows a meaningfully higher same-day rate than on days without the food. This is not a 'safe foods' list — it only reflects what hasn't shown an elevated association in your data so far, for the symptoms you're tracking.">
        Low observed symptom association
      </CardTitle>
      {foods.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No food currently clears this bar — either nothing is eaten on 20+ tracked days yet, or every
          frequently-eaten food shows at least one symptom with a meaningfully elevated same-day rate in this
          data. That&apos;s a real finding worth noting on its own, not an error.
        </p>
      )}
      {foods.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
              <th className="pb-2 font-medium">Food</th>
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 text-right font-medium">Days eaten</th>
              <th className="pb-2 text-right font-medium">Largest symptom diff observed</th>
            </tr>
          </thead>
          <tbody>
            {foods.map((f) => (
              <tr key={f.item} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="py-2" style={{ color: "var(--text-primary)" }}>
                  {f.item}
                </td>
                <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                  {f.category}
                </td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {f.exposureDays}
                </td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {f.worstSymptomLabel ? (
                    <>
                      {f.worstSymptomDiffPct > 0 ? "+" : ""}
                      {f.worstSymptomDiffPct}pp ({f.worstSymptomLabel})
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
