import type { ReactNode } from "react";
import clsx from "clsx";

/** The `<h1>` at the top of every analytics dashboard, with a short bar in
 * that area's colour on the left — the same domain-colour cue the Log page
 * uses, so "you're looking at Food / Cycle / …" reads at a glance. */
export function DashboardHeader({ accent, className, children }: { accent: string; className?: string; children: ReactNode }) {
  return (
    <h1
      className={clsx("border-l-[3px] pl-2.5 text-xl font-semibold tracking-tight", className)}
      style={{ color: "var(--text-primary)", borderColor: accent }}
    >
      {children}
    </h1>
  );
}
