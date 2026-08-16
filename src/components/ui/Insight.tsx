import type { InsightTone } from "@/lib/aggregations/insights";
import { Card } from "./Card";

const TONE_COLOR: Record<InsightTone, string> = {
  good: "var(--status-good)",
  neutral: "var(--text-muted)",
  attention: "var(--status-warning)",
  serious: "var(--status-serious)",
};

/**
 * The primary synthesized insight for a page — DECISION before CONTEXT
 * before DATA. Deliberately the single strongest visual element after the
 * page title: the only place on a page (besides Food's priorities list)
 * that uses the "primary" card tier. Never stacked more than once per page.
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
    <Card tier="primary">
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: TONE_COLOR[tone] }}>
        {label}
      </p>
      <p className="mt-2 text-xl leading-snug font-semibold" style={{ color: "var(--text-primary)" }}>
        {headline}
      </p>
      {detail && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
    </Card>
  );
}
