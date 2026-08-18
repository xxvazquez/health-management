import { SAMPLE_TIER_EXPLANATION, SAMPLE_TIER_LABEL, type SampleTier } from "@/lib/aggregations/patterns";

const SAMPLE_TIER_COLOR: Record<SampleTier, string> = {
  insufficient: "var(--text-muted)",
  exploratory: "var(--status-warning)",
  moderate: "var(--series-1)",
  strong: "var(--status-good)",
};

/** Shared across every page that surfaces an `AssociationResult` (Patterns,
 * Digestion, Overview) — one consistent way to show how much to trust a
 * given comparison. */
export function SampleTierBadge({ tier }: { tier: SampleTier }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap uppercase tracking-wide"
      style={{ color: SAMPLE_TIER_COLOR[tier], background: "var(--page-plane)" }}
      title={SAMPLE_TIER_EXPLANATION[tier]}
    >
      {SAMPLE_TIER_LABEL[tier]}
    </span>
  );
}
