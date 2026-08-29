"use client";

import { Card, CardTitle } from "@/components/ui/Card";
import { SampleTierBadge } from "@/components/ui/SampleTierBadge";
import type { PersonalTrends } from "@/lib/aggregations/overview";
import type { AssociationResult } from "@/lib/aggregations/patterns";

/** "the same day as X" / "the day after X" / "2 days after X" — never
 * "causes", matching this whole section's non-causal framing. */
function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return "the same day as";
  if (lagDays === 1) return "the day after";
  return `${lagDays} days after`;
}

/**
 * Overview's "Personal Trends" — a short, descriptive list of what's
 * changed recently across every domain (`trends`) and what stands out
 * cross-domain (`findings`). Deliberately no charts here — a handful of
 * sentences, capped short by the aggregations themselves, never a dashboard.
 */
export function PersonalTrendsSection({
  trends,
  findings,
}: {
  trends: PersonalTrends;
  findings: AssociationResult[];
}) {
  const changed = trends.changed;
  if (changed.length === 0 && findings.length === 0) return null;

  return (
    <Card tier="supporting">
      <CardTitle>Personal trends</CardTitle>

      {changed.length > 0 && (
        <ul className="flex flex-col">
          {changed.map((b, i) => (
            <li
              key={`${b.label}-${i}`}
              className="py-2 first:pt-0 last:pb-0"
              style={{ borderTop: i > 0 ? "1px solid var(--gridline)" : "none" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {b.label}
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {b.detail}
              </p>
            </li>
          ))}
        </ul>
      )}

      {findings.length > 0 && (
        <div className={changed.length > 0 ? "mt-3 border-t pt-3" : ""} style={{ borderColor: "var(--gridline)" }}>
          <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
            What stands out
          </p>
          <ul className="flex flex-col gap-2">
            {findings.map((f) => (
              <li key={`${f.causeLabel}-${f.outcomeLabel}`} className="flex flex-wrap items-center justify-between gap-2">
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
        </div>
      )}
    </Card>
  );
}
