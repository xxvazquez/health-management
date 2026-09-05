import clsx from "clsx";

/**
 * The "show N more" progressive-disclosure toggle — one shape for every
 * list that reveals more rows on demand (Recent activity, the Food
 * dashboard lists). Not for hiding real information, just trimming a long
 * list to a sensible default.
 *
 * Pass `expanded` for a list that collapses back to its default ("Show
 * less"); omit it for a list that only ever grows.
 */
export function ShowMore({
  hiddenCount,
  expanded = false,
  onClick,
  className,
}: {
  hiddenCount: number;
  expanded?: boolean;
  onClick: () => void;
  className?: string;
}) {
  if (hiddenCount <= 0 && !expanded) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("self-start text-xs font-medium underline decoration-dotted", className)}
      style={{ color: "var(--text-secondary)" }}
    >
      {expanded ? "Show less" : `Show ${hiddenCount} more`}
    </button>
  );
}
