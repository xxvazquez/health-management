import type { ReactNode } from "react";
import clsx from "clsx";
import { MobileMenuButton } from "@/components/MobileMenuButton";

/**
 * The heading block at the top of a page: an `<h1>` (plus an optional
 * subtitle and a trailing actions slot) with a short rule on the left in
 * the area's colour. Section pages pass their domain hue; cross-domain
 * pages (Overview, Manage, Help, My Drive) take the neutral default. The
 * rule spans the whole block so the subtitle lines up under the heading.
 *
 * `DashboardHeader` (Trends) and `BoardPage` (Notes) render
 * this same block — keep the three in step.
 */
export function PageHeading({
  children,
  subtitle,
  accent = "var(--text-muted)",
  actions,
  className,
  as: Heading = "h1",
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  actions?: ReactNode;
  className?: string;
  /** `h2` for a heading nested under a page-level `<h1>` (a dashboard tab
   * inside the "Trends" page). Same size, still the area's rule. */
  as?: "h1" | "h2";
}) {
  return (
    <div className={clsx("border-l-[3px] pl-2.5", className)} style={{ borderColor: accent }}>
      <div className="flex items-start justify-between gap-3">
        <Heading
          className="min-w-0 text-2xl font-bold tracking-tight text-balance lg:text-xl lg:font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {children}
        </Heading>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <MobileMenuButton />
        </div>
      </div>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
