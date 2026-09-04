"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";

/** Most pages read comfortably at the app's default measure (max-w-4xl).
 * The dense pages opt into a wider measure here, keyed off the route:
 * Analytics and Overview (charts, paired cards, two-column layouts), and
 * the list pages Personal and Household — their Notes / Reminders /
 * Expiration / Codes tabs lay their grouped cards out two-up on `xl`, so
 * the width is used rather than stranded (Journal and Wishlist stay a
 * single narrow column and cap themselves). */
const WIDE_ROUTES = ["/analytics", "/overview", "/personal", "/home"];

export function ContentContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = WIDE_ROUTES.some((route) => pathname === route || pathname === `${route}/` || pathname?.startsWith(`${route}/`));
  return <div className={clsx("mx-auto w-full", wide ? "max-w-6xl" : "max-w-4xl")}>{children}</div>;
}
