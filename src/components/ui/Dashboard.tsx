import type { ReactNode } from "react";
import { PageHeading } from "@/components/ui/PageHeading";

/**
 * The one shell every Trends dashboard adopts in Step 5. Not yet wired.
 *
 * Order, fixed for every dashboard: heading → purpose line → summary strip
 * (the date filter, top-right, above the stat tiles) → lead insight (one
 * accented sentence, never a card) → the main visualisation and supporting
 * content → a methodology link.
 *
 * Everything except `title` and `children` is optional — a dashboard with
 * just a sentence and one chart passes `insight` + `children` and nothing
 * else.
 */
export function Dashboard({
  title,
  accent,
  purpose,
  filter,
  summary,
  insight,
  children,
  methodology,
}: {
  title: ReactNode;
  /** Domain hue for the heading's left rule. */
  accent?: string;
  /** One muted sentence under the heading — what this dashboard answers. */
  purpose?: ReactNode;
  /** The single date-range control. */
  filter?: ReactNode;
  /** Stat tiles, as one equal-width row. */
  summary?: ReactNode;
  /** One accented sentence — the lead finding. Rendered as a paragraph. */
  insight?: ReactNode;
  children: ReactNode;
  /** A "how this is calculated" link. */
  methodology?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading accent={accent} subtitle={purpose}>
        {title}
      </PageHeading>

      {(filter || summary) && (
        <div className="flex flex-col gap-3">
          {filter && <div className="flex justify-end">{filter}</div>}
          {summary}
        </div>
      )}

      {insight && (
        <p className="max-w-[60ch] text-base" style={{ color: "var(--text-secondary)" }}>
          {insight}
        </p>
      )}

      {children}

      {methodology && <div className="pt-1">{methodology}</div>}
    </div>
  );
}
