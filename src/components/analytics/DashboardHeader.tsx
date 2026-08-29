import type { ReactNode } from "react";
import clsx from "clsx";

/** The heading block at the top of every analytics dashboard: the `<h1>`
 * (and its optional subtitle) with a short bar in that area's colour on the
 * left — the same domain-colour cue the Log page uses, so "you're looking
 * at Food / Cycle / …" reads at a glance. The bar spans the whole block so
 * the subtitle lines up under the heading, not 3px to its left. */
export function DashboardHeader({
  accent,
  className,
  subtitle,
  children,
}: {
  accent: string;
  className?: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={clsx("border-l-[3px] pl-2.5", className)} style={{ borderColor: accent }}>
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        {children}
      </h1>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
