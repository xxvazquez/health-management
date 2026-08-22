"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";

/** Most pages read comfortably at the app's default measure (max-w-4xl).
 * Food is a dense analytics dashboard (charts, tables, paired cards) that
 * genuinely benefits from more desktop width — this is the one opt-in
 * point for that, keyed off the route so every other page's width is
 * completely untouched. */
const WIDE_ROUTES = ["/food"];

export function ContentContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = WIDE_ROUTES.some((route) => pathname === route || pathname?.startsWith(`${route}/`));
  return <div className={clsx("mx-auto w-full", wide ? "max-w-6xl" : "max-w-4xl")}>{children}</div>;
}
