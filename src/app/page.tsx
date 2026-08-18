"use client";

import { useMemo, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardTitle } from "@/components/ui/Card";
import { SampleTierBadge } from "@/components/ui/SampleTierBadge";
import { computeOverviewStats, computeOverviewInsight, topCrossDomainFindings } from "@/lib/aggregations/overview";
import type { Bullet } from "@/lib/aggregations/insights";
import type { AssociationResult } from "@/lib/aggregations/patterns";
import { TYPE_ACCENT } from "@/taxonomy/categories";

/** "the same day as X" / "the day after X" / "2 days after X" */
function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return "the same day as";
  if (lagDays === 1) return "the day after";
  return `${lagDays} days after`;
}

/** The strongest cross-domain findings, app-wide — a pointer at what's
 * worth a closer look on Digestion/Patterns, not the full picture (no
 * bars, no underlying counts here; that detail lives on those pages). */
function CrossDomainFindings({ findings }: { findings: AssociationResult[] }) {
  return (
    <Card tier="raw">
      <p className="mb-2.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
        What stands out
      </p>
      <ul className="flex flex-col">
        {findings.map((f, i) => (
          <li
            key={`${f.causeLabel}-${f.outcomeLabel}`}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            style={{ borderTop: i > 0 ? "1px solid var(--gridline)" : "none" }}
          >
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="font-semibold">{f.outcomeLabel}</span>{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                {f.diffPct > 0 ? "occurred more often" : "occurred less often"} {lagPhrase(f.lagDays)}
              </span>{" "}
              <span className="font-semibold">{f.causeLabel}</span>
            </p>
            <SampleTierBadge tier={f.sampleTier} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

/** "What matters" / "Needs attention" — subject prominent, explanation
 * secondary, stacked instead of joined into one long sentence. Boxed and
 * divided so a long list still reads as discrete facts, not a paragraph. */
function FindingsPanel({ title, tone, items, emptyText }: { title: string; tone: string; items: Bullet[]; emptyText: string }) {
  return (
    <Card tier="raw">
      <p className="mb-2.5 text-xs font-semibold tracking-wide uppercase" style={{ color: tone }}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((b, i) => (
            <li
              key={b.label}
              className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0"
              style={{ borderTop: i > 0 ? "1px solid var(--gridline)" : "none" }}
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {b.label}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {b.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** "What changed" — a dense grid of compact facts. The label names what
 * moved; the value (the actual magnitude/context) is the prominent line,
 * since that number is the point, not the sentence around it. */
function ChangeTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <p className="truncate text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export default function OverviewPage() {
  const { status, events, gymLogs, unclassifiedItems } = useData();

  const stats = useMemo(() => (events.length > 0 ? computeOverviewStats(events) : null), [events]);
  const insight = useMemo(() => computeOverviewInsight(events), [events]);
  const crossDomainFindings = useMemo(() => topCrossDomainFindings(events, gymLogs), [events, gymLogs]);

  if (status === "loading") {
    return <p style={{ color: "var(--text-secondary)" }}>Loading your data…</p>;
  }
  if (status === "empty" || !stats) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Overview
      </h1>

      {!insight.insufficientData && (insight.whatMatters.length > 0 || insight.needsAttention.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FindingsPanel
            title="What matters"
            tone="var(--status-good)"
            items={insight.whatMatters}
            emptyText="Not enough food data yet to say what's well covered."
          />
          <FindingsPanel
            title="Needs attention"
            tone="var(--status-warning)"
            items={insight.needsAttention}
            emptyText="No standout gaps against established food-group guidance right now."
          />
        </div>
      )}

      {!insight.insufficientData && insight.whatChanged.length > 0 && (
        <div>
          <SectionLabel>What changed</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {insight.whatChanged.map((b, i) => (
              <ChangeTile key={`${b.label}-${i}`} label={b.label} value={b.compact ?? b.detail} />
            ))}
          </div>
        </div>
      )}

      {crossDomainFindings.length > 0 && <CrossDomainFindings findings={crossDomainFindings} />}

      <div>
        <SectionLabel>At a glance</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Most tracked food"
            value={stats.food.topFood?.item ?? "—"}
            detail={stats.food.topFood ? `${stats.food.topFood.count} days` : undefined}
            accent={TYPE_ACCENT.food}
          />
          <StatTile
            label="Least tracked food"
            value={stats.food.leastTrackedFood?.item ?? "—"}
            detail={stats.food.leastTrackedFood ? `${stats.food.leastTrackedFood.count} day${stats.food.leastTrackedFood.count === 1 ? "" : "s"}` : undefined}
            accent={TYPE_ACCENT.food}
          />
          <StatTile
            label="Supplement consistency"
            value={`${stats.supplements.averageConsistencyPct}%`}
            detail={`avg across ${stats.supplements.count} tracked`}
            accent={TYPE_ACCENT.supplement}
          />
          <StatTile
            label="Most consistent supplement"
            value={stats.supplements.mostConsistent?.item ?? "—"}
            detail={stats.supplements.mostConsistent ? `${stats.supplements.mostConsistent.consistencyPct}% consistency` : undefined}
            accent={TYPE_ACCENT.supplement}
          />
          <StatTile
            label="Habit consistency"
            value={`${stats.habits.averageConsistencyPct}%`}
            detail={`avg across ${stats.habits.count} tracked`}
            accent={TYPE_ACCENT.habit}
          />
          <StatTile
            label="Most common Bristol type"
            value={stats.digestion.mostCommonBristol?.item ?? "—"}
            detail={stats.digestion.mostCommonBristol ? `${stats.digestion.mostCommonBristol.sharePct}% of logged days` : undefined}
            accent={TYPE_ACCENT.outcome}
          />
          <StatTile
            label="Digestive symptom frequency"
            value={`${stats.digestion.digestiveSymptomDaysPct}%`}
            detail="of tracked days"
            accent={TYPE_ACCENT.outcome}
          />
        </div>
      </div>

      {unclassifiedItems.length > 0 && (
        <Card tier="raw">
          <CardTitle size="sm" subtitle="Data-quality notes — nothing here affects your logged history, only how it's grouped and displayed">
            Needs a closer look
          </CardTitle>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {unclassifiedItems.length} item{unclassifiedItems.length === 1 ? "" : "s"} filed under Habits by
              default
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              These raw names didn&apos;t match any known food/supplement/symptom pattern, so they defaulted to
              Habits → Other. Add an entry for each to <code>src/taxonomy/overrides.json</code> to reclassify.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unclassifiedItems.map((name) => (
                <span
                  key={name}
                  className="rounded-full px-2.5 py-1 text-xs whitespace-nowrap"
                  style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
