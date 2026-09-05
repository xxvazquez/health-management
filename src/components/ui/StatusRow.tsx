import type { ReactNode } from "react";
import clsx from "clsx";

export type StatusTone = "good" | "warning" | "serious" | "critical";

const TONE_COLOR: Record<StatusTone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
};

/**
 * One treatment for every "overdue / flagged / expired / due" line: a
 * small mark in the semantic tone plus a label. Replaces the three
 * different overdue treatments (red dot + text / red clock icon / red
 * alarm icon) — adopted by Agenda in Step 2 and the boards in Step 6.
 *
 * `--status-*` is for status only, never as an accent — that separation is
 * the point of this component.
 */
export function StatusRow({
  tone,
  icon,
  children,
  className,
}: {
  tone: StatusTone;
  /** Overrides the default dot — pass a 12–14px line glyph. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", className)} style={{ color }}>
      {icon ?? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}
