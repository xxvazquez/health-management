import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * The heading block at the top of a page: an `<h1>` (plus an optional
 * subtitle and a trailing actions slot) with a short rule on the left in
 * the area's colour. Section pages pass their domain hue; cross-domain
 * pages (Overview, Manage, Help, My Drive) take the neutral default. The
 * rule spans the whole block so the subtitle lines up under the heading.
 *
 * `DashboardHeader` (analytics) and `BoardPage` (Personal/Household) render
 * this same block — keep the three in step.
 */
export function PageHeading({
  children,
  subtitle,
  accent = "var(--text-muted)",
  actions,
  className,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("border-l-[3px] pl-2.5", className)} style={{ borderColor: accent }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {children}
        </h1>
        {actions}
      </div>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
