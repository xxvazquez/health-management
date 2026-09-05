import type { ReactNode } from "react";
import clsx from "clsx";

export type ShellWidth = "narrow" | "standard" | "wide";

/**
 * Page-type-driven content width, plus an optional 300px right rail.
 *
 * Replaces the route-keyed `ContentContainer` over the course of the
 * restructure — pages opt in one at a time (Step 6), so this is not yet
 * wired anywhere. Widths: narrow 720 (forms, threads, feeds with nothing
 * beside them), standard 960 (boards, lists, most dashboards), wide 1120
 * (a right rail or a multi-column chart grid).
 *
 * The rail renders below the main column on mobile and as a fixed 300px
 * column on `lg`+. Only pass it with genuinely persistent secondary
 * content — a sticky filter, a live summary. If the only candidate is
 * whitespace, drop the rail and use a narrower `width`.
 */
export function PageShell({
  width = "standard",
  rail,
  children,
  className,
}: {
  width?: ShellWidth;
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const maxW = width === "narrow" ? "max-w-[720px]" : width === "wide" || rail ? "max-w-[1120px]" : "max-w-[960px]";

  if (rail) {
    return (
      <div className={clsx("mx-auto w-full max-w-[1120px]", className)}>
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
          <div className="min-w-0 flex-1">{children}</div>
          <aside className="lg:w-[300px] lg:shrink-0">{rail}</aside>
        </div>
      </div>
    );
  }

  return <div className={clsx("mx-auto w-full", maxW, className)}>{children}</div>;
}
