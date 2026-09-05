import type { ReactNode } from "react";
import { PageHeading } from "@/components/ui/PageHeading";

/** The heading block at the top of every analytics dashboard: the `<h1>`
 * (and its optional subtitle) with a short bar in that area's colour on the
 * left — the same domain-colour cue the Log page uses, so "you're looking
 * at Food / Cycle / …" reads at a glance. */
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
    <PageHeading accent={accent} className={className} subtitle={subtitle}>
      {children}
    </PageHeading>
  );
}
