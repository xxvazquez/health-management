import type { InsightTone } from "@/lib/aggregations/insights";
import { Card } from "./Card";

const TONE_COLOR: Record<InsightTone, string> = {
  good: "var(--status-good)",
  neutral: "var(--text-muted)",
  attention: "var(--status-warning)",
  serious: "var(--status-serious)",
};

/**
 * The synthesized insight for a page — DECISION before CONTEXT before
 * DATA. A plain card with a coloured kicker rather than a heavy panel:
 * the tone label and its position at the top of the page carry the
 * emphasis. Never stacked more than once per page.
 */
export function Insight({
  label,
  headline,
  detail,
  tone = "neutral",
}: {
  label: string;
  headline: string;
  detail?: string | null;
  tone?: InsightTone;
}) {
  return (
    <Card tier="supporting" padded={false} className="px-4 py-3.5">
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: TONE_COLOR[tone] }}>
        {label}
      </p>
      <p className="mt-1 text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
        {headline}
      </p>
      {detail && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
    </Card>
  );
}
