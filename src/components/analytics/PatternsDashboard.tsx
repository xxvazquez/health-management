"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Insight } from "@/components/ui/Insight";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Methodology } from "@/components/ui/Methodology";
import { SampleTierBadge } from "@/components/ui/SampleTierBadge";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import {
  allCauseOptions,
  computeLaggedAssociations,
  generateTopPatterns,
  lowSymptomAssociationFoods,
  matchItem,
  MULTIPLE_COMPARISONS_NOTE,
} from "@/lib/aggregations/patterns";
import { generateInsights, trackingCoverageSummary } from "@/lib/aggregations/recommendations";
import { colorForCategorySlot } from "@/taxonomy/categories";
import type { CanonicalEvent, RawWorkoutLog } from "@/lib/types";

/** "the same day as X" / "the day after X" / "2 days after X" */
function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return "the same day as";
  if (lagDays === 1) return "the day after";
  return `${lagDays} days after`;
}

/** Inline colour-coded label for the "What might be worth adjusting?" rows. */
function AdjustTag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      style={{ background: `color-mix(in oklab, ${color} 15%, var(--surface-1))`, color }}
    >
      {children}
    </span>
  );
}

export function PatternsDashboard() {
  const { status, events, workoutLogs } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const filteredWorkoutLogs = useMemo(
    () => (range ? workoutLogs.filter((g) => g.date >= range.start && g.date <= range.end) : workoutLogs),
    [workoutLogs, range],
  );

  const topPatterns = useMemo(() => generateTopPatterns(filtered, filteredWorkoutLogs), [filtered, filteredWorkoutLogs]);
  const insights = useMemo(() => generateInsights(filtered), [filtered]);
  const coverage = useMemo(() => trackingCoverageSummary(filtered), [filtered]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DashboardHeader subtitle="For when you want to dig deeper — associations and correlations in your own data. Descriptive only, never causal.">
          Patterns
        </DashboardHeader>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      {topPatterns.length > 0 ? (
        <Card tier="supporting" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
              style={{ background: "color-mix(in oklab, var(--ui-accent) 15%, var(--surface-1))", color: "var(--ui-accent)" }}
            >
              Strongest signal
            </span>
            <SampleTierBadge tier={topPatterns[0].sampleTier} />
          </div>
          <p className="text-base leading-snug" style={{ color: "var(--text-primary)" }}>
            <strong className="font-semibold">{topPatterns[0].outcomeLabel}</strong>{" "}
            {topPatterns[0].diffPct > 0 ? "occurred more often" : "occurred less often"} {lagPhrase(topPatterns[0].lagDays)}{" "}
            <strong className="font-semibold">{topPatterns[0].causeLabel}</strong>.
          </p>
          <ComparisonBars
            withLabel={`With ${topPatterns[0].causeLabel}`}
            withPct={topPatterns[0].withPct}
            withCount={topPatterns[0].withCount}
            withTotal={topPatterns[0].withTotal}
            withoutLabel={`Without ${topPatterns[0].causeLabel}`}
            withoutPct={topPatterns[0].withoutPct}
            withoutCount={topPatterns[0].withoutCount}
            withoutTotal={topPatterns[0].withoutTotal}
            direction={topPatterns[0].diffPct > 0 ? "more" : "less"}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Association only, never proof of cause — from {topPatterns[0].withTotal + topPatterns[0].withoutTotal} days of
            overlapping tracking.
          </p>
        </Card>
      ) : (
        <Insight
          label="Patterns"
          headline="Nothing stands out strongly yet."
          detail="Each association needs about 10 days with the thing and 5 without before it shows here. Keep logging both sides."
          tone="neutral"
        />
      )}

      {coverage && (
        <p className="max-w-3xl text-xs" style={{ color: "var(--text-muted)" }}>
          {coverage.totalTrackedDays} of {coverage.totalCalendarDays} days in this range have at least one entry
          ({coverage.coveragePct}%). Days with nothing logged are excluded from every percentage on this page,
          never counted as &quot;nothing happened&quot;.
        </p>
      )}

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Each pair shows whichever of 4 lags (same day to +3 days) has the strongest signal.">
          Other associations
        </CardTitle>
        {topPatterns.length > 1 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {topPatterns.slice(1).map((p, i) => (
              <div key={i} className="rounded-lg border p-3.5" style={{ borderColor: "var(--gridline)" }}>
                <div className="mb-2 flex items-start justify-between gap-2">
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {topPatterns.length === 1
              ? "That's the only association that cleared the bar in this range."
              : "Not enough data yet to surface a reliable association (each comparison needs at least 10 exposed days and 5 unexposed days, at every lag checked)."}
          </p>
        )}
        <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
          Association only, not evidence of cause.
        </p>
        <div className="mt-2">
          <Methodology label="Why so few results?">{MULTIPLE_COMPARISONS_NOTE}</Methodology>
        </div>
      </Card>

      <LagExplorer events={filtered} workoutLogs={filteredWorkoutLogs} />

      <ToleratedFoods events={filtered} />

      <Card tier="raw">
        <CardTitle size="sm" subtitle="Observed facts and a cautious reading — never a nutritional prescription.">
          What might be worth adjusting?
        </CardTitle>
        {insights.length > 0 ? (
          <ul className={`grid gap-3 ${insights.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {insights.map((insight, i) => (
              <li
                key={i}
                className={`flex flex-col gap-2.5 rounded-lg border p-3.5 ${
                  insights.length % 2 === 1 && i === insights.length - 1 ? "sm:col-span-2" : ""
                }`}
                style={{ borderColor: "var(--gridline)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {insight.title}
                </p>
                <div className="flex flex-col gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    <AdjustTag color="var(--text-muted)">Observed</AdjustTag>
                    {insight.observed}
                  </p>
                  <p>
                    <AdjustTag color="var(--series-2)">Reading</AdjustTag>
                    {insight.interpretation}
                  </p>
                  {insight.recommendation && (
                    <p
                      className="rounded-md p-2.5"
                      style={{ background: "color-mix(in oklab, var(--status-good) 10%, var(--surface-1))", color: "var(--text-primary)" }}
                    >
                      <AdjustTag color="var(--status-good)">Try</AdjustTag>
                      {insight.recommendation}
                    </p>
                  )}
                </div>
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

function LagExplorer({ events, workoutLogs }: { events: CanonicalEvent[]; workoutLogs: RawWorkoutLog[] }) {
  const causeOptions = useMemo(() => allCauseOptions(events, workoutLogs), [events, workoutLogs]);

  const outcomeOptions = useMemo(() => {
    const items = Array.from(
      new Set(events.filter((e) => e.itemType === "outcome").map((e) => e.item)),
    );
    return items.map((item) => ({ label: item, value: item }));
  }, [events]);

  const [cause, setCause] = useState(causeOptions[0]?.label ?? "");
  const [outcome, setOutcome] = useState(outcomeOptions[0]?.value ?? "");

  // Falls back to the first available option not just when nothing's been
  // picked yet, but also when the previously-picked one no longer exists in
  // the current options — e.g. narrowing the date range filter above until
  // the selected cause has zero occurrences left. Without this, the select
  // would sit on a value with no matching option and the results grid would
  // just go silently blank.
  const effectiveCause = causeOptions.some((o) => o.label === cause) ? cause : (causeOptions[0]?.label ?? "");
  const effectiveOutcome = outcomeOptions.some((o) => o.value === outcome) ? outcome : (outcomeOptions[0]?.value ?? "");

  const results = useMemo(() => {
    if (!effectiveCause || !effectiveOutcome) return [];
    const causeOption = causeOptions.find((o) => o.label === effectiveCause);
    if (!causeOption) return [];
    const outcomeMatcher = matchItem(effectiveOutcome);
    return computeLaggedAssociations(events, causeOption.label, causeOption.dates, outcomeMatcher, [0, 1, 2, 3]);
  }, [events, causeOptions, effectiveCause, effectiveOutcome]);

  if (causeOptions.length === 0 || outcomeOptions.length === 0) return null;

  return (
    <Card tier="raw">
      <CardTitle size="sm" subtitle="Does the association get stronger 1–3 days after the cause instead of the same day?">
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
                  {r.diffPct} pts
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
    <Card tier="raw">
      <CardTitle size="sm" subtitle="Foods eaten on 20+ tracked days with no meaningfully elevated same-day symptom rate. Not a 'safe foods' list.">
        Low observed symptom association
      </CardTitle>
      {foods.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No food currently clears this bar — either nothing is eaten on 20+ tracked days yet, or every
          frequently-eaten food shows at least one symptom with a meaningfully elevated same-day rate in this
          data. That&apos;s a real finding worth noting on its own, not an error.
        </p>
      )}
      {foods.length > 0 &&
        (() => {
          const maxDays = Math.max(...foods.map((f) => f.exposureDays), 1);
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    <th className="pb-2 pr-6 font-medium">Food</th>
                    <th className="pb-2 pr-6 font-medium">Days eaten</th>
                    <th className="pb-2 text-right font-medium">Largest symptom diff</th>
                  </tr>
                </thead>
                <tbody>
                  {foods.map((f) => {
                    const worse = f.worstSymptomLabel != null && f.worstSymptomDiffPct > 0;
                    return (
                      <tr key={f.item} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                        <td className="py-2.5 pr-6">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: colorForCategorySlot(f.category) }}
                              aria-hidden="true"
                            />
                            <span style={{ color: "var(--text-primary)" }}>{f.item}</span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {f.category}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-6">
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-16 shrink-0 rounded-full" style={{ background: "var(--page-plane)" }}>
                              <span
                                className="block h-1.5 rounded-full"
                                style={{ width: `${(f.exposureDays / maxDays) * 100}%`, background: "var(--series-1)" }}
                              />
                            </span>
                            <span className="tabular-nums text-xs" style={{ color: "var(--text-secondary)" }}>
                              {f.exposureDays}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                          {f.worstSymptomLabel ? (
                            <>
                              <span
                                className="font-medium"
                                style={{ color: worse ? "var(--status-warning)" : "var(--status-good)" }}
                              >
                                {f.worstSymptomDiffPct > 0 ? "+" : ""}
                                {f.worstSymptomDiffPct} pts
                              </span>{" "}
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                {f.worstSymptomLabel}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
    </Card>
  );
}
