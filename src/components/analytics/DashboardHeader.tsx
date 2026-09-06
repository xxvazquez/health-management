import type { ReactNode } from "react";
import clsx from "clsx";

/** The heading block at the top of every Trends dashboard — the domain
 * name as a plain secondary heading (`<h2>`) plus an optional purpose
 * line. No left rule: the page-level "Trends" `<h1>` already carries the
 * area colour, and a second ruled heading right under it just doubled the
 * cue. `className` still passes through for grid-span on the dashboards
 * that lay their content out in two columns. */
export function DashboardHeader({
  className,
  subtitle,
  children,
}: {
  className?: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        {children}
      </h2>
      {subtitle && (
        <p className="max-w-[62ch] text-sm" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
