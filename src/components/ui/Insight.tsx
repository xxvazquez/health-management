import type { ReactNode } from "react";
import clsx from "clsx";
import type { InsightTone } from "@/lib/aggregations/insights";

const TONE_COLOR: Record<InsightTone, string> = {
  good: "var(--status-good)",
  neutral: "var(--text-secondary)",
  attention: "var(--status-warning)",
  serious: "var(--status-serious)",
};

/**
 * The synthesized lead finding for a dashboard — DECISION before CONTEXT
 * before DATA, at the top of the page. A light card with a coloured kicker
 * chip, matching the Patterns lead card, so the finding reads clearly
 * against the page instead of blending into it. Never stacked more than
 * once.
 */
export function Insight({
  label,
  headline,
  detail,
  stat,
  tone = "neutral",
  className,
}: {
  label: string;
  headline: ReactNode;
  detail?: ReactNode | null;
  /** A lone headline figure (a `StatChip` or two) with nothing else to
   * share a row with — folded into the card instead of sitting alone on
   * its own near-empty row below it. */
  stat?: ReactNode;
  tone?: InsightTone;
  className?: string;
}) {
  return (
    <div
      className={clsx("flex flex-col gap-1 rounded-xl border p-3.5", className)}
      style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}
    >
      <span
        className="self-start text-xs font-semibold tracking-wide uppercase"
        style={{ color: TONE_COLOR[tone] }}
      >
        {label}
      </span>
      <p className="max-w-[62ch] text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
        {headline}
      </p>
      {detail && (
        <p className="max-w-[62ch] text-xs" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
      {stat && <div className="mt-1 flex flex-wrap gap-2">{stat}</div>}
    </div>
  );
}
