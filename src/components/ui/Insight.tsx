import type { ReactNode } from "react";
import clsx from "clsx";
import type { InsightTone } from "@/lib/aggregations/insights";

const TONE_COLOR: Record<InsightTone, string> = {
  good: "var(--status-good)",
  neutral: "var(--text-muted)",
  attention: "var(--status-warning)",
  serious: "var(--status-serious)",
};

/**
 * The synthesized lead finding for a dashboard — DECISION before CONTEXT
 * before DATA, at the top of the page. A plain block, not a card: the
 * coloured kicker and its position carry the emphasis, and a boxed
 * one-liner reads as heavier than it is. Never stacked more than once.
 */
export function Insight({
  label,
  headline,
  detail,
  tone = "neutral",
  className,
}: {
  label: string;
  headline: ReactNode;
  detail?: ReactNode | null;
  tone?: InsightTone;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: TONE_COLOR[tone] }}>
        {label}
      </p>
      <p className="max-w-[62ch] text-base leading-snug" style={{ color: "var(--text-primary)" }}>
        {headline}
      </p>
      {detail && (
        <p className="max-w-[62ch] text-sm" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
