"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";

/** Most pages read comfortably at the app's default measure (max-w-4xl).
 * The Analytics dashboards and the Overview page are dense (charts, tables,
 * paired cards, a two-column desktop layout) and genuinely benefit from
 * more desktop width — this is the one opt-in point for that, keyed off the
 * route so every other page's width is untouched. */
const WIDE_ROUTES = ["/analytics", "/overview"];

export function ContentContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = WIDE_ROUTES.some((route) => pathname === route || pathname === `${route}/` || pathname?.startsWith(`${route}/`));
  return <div className={clsx("mx-auto w-full", wide ? "max-w-6xl" : "max-w-4xl")}>{children}</div>;
}
