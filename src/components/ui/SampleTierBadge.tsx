import { SAMPLE_TIER_EXPLANATION, SAMPLE_TIER_LABEL, type SampleTier } from "@/lib/aggregations/patterns";

/** How much to trust a comparison — filled dots (1 / 2 / 3) plus a word,
 * so the tier reads at a glance instead of every chip looking alike.
 * Shared across every page that surfaces an `AssociationResult` (Patterns,
 * Stool, Agenda). */
const TIER_META: Record<SampleTier, { dots: number; color: string }> = {
  insufficient: { dots: 0, color: "var(--text-muted)" },
  exploratory: { dots: 1, color: "var(--text-muted)" },
  moderate: { dots: 2, color: "var(--series-1)" },
  strong: { dots: 3, color: "var(--status-good)" },
};

export function SampleTierBadge({ tier }: { tier: SampleTier }) {
  const { dots, color } = TIER_META[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap uppercase tracking-wide"
      style={{ color, background: `color-mix(in oklab, ${color} 12%, var(--surface-1))` }}
      title={SAMPLE_TIER_EXPLANATION[tier]}
    >
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: i < dots ? color : `color-mix(in oklab, ${color} 30%, transparent)` }}
          />
        ))}
      </span>
      {SAMPLE_TIER_LABEL[tier]}
    </span>
  );
}
