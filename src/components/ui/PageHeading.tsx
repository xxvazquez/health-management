import type { ReactNode } from "react";
import { MobileMenuButton } from "@/components/MobileMenuButton";

/**
 * The heading block at the top of a page: an `<h1>` (plus an optional
 * subtitle and a trailing actions slot) — a large title flush with the
 * page content, like an iOS large-title navigation bar.
 *
 * `DashboardHeader` (Trends) and `BoardPage` (Notes) render
 * this same block — keep the three in step.
 */
export function PageHeading({
  children,
  subtitle,
  actions,
  actionsBelow = false,
  className,
  as: Heading = "h1",
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Put `actions` on their own row under the title (for a wide cluster)
   * instead of beside it, so the menu button stays top-right. */
  actionsBelow?: boolean;
  className?: string;
  /** `h2` for a heading nested under a page-level `<h1>` (a dashboard tab
   * inside the "Trends" page). Same size. */
  as?: "h1" | "h2";
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <Heading
          className="min-w-0 text-[1.75rem] leading-tight font-bold tracking-tight text-balance"
          style={{ color: "var(--text-primary)" }}
        >
          {children}
        </Heading>
        <div className="flex shrink-0 items-center gap-2">
          {!actionsBelow && actions}
          <MobileMenuButton />
        </div>
        {actionsBelow && actions && <div className="flex basis-full items-center gap-2">{actions}</div>}
      </div>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
