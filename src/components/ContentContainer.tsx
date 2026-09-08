"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";

/** Content width by page type, not a wide/narrow allow-list.
 *
 * - **max-w-2xl** — a single reading column: partner messages.
 * - **max-w-3xl** — plain documentation: Help.
 * - **max-w-6xl** — the page genuinely uses the width: Log's tap-grid,
 *   and Agenda, whose own `PageShell` lays out the filter rail inside.
 * - **max-w-4xl** (default) — everything else: one readable column of
 *   cards, lists, a chart or a board. A narrow-looking page here is the
 *   intent, not a bug — better than a 600px chart stranded in 1150px.
 */
const WIDTH_BY_PREFIX: { prefix: string; cls: string }[] = [
  { prefix: "/notes", cls: "max-w-2xl" },
  { prefix: "/help", cls: "max-w-3xl" },
  { prefix: "/log", cls: "max-w-6xl" },
  { prefix: "/agenda", cls: "max-w-6xl" },
  { prefix: "/analytics", cls: "max-w-6xl" },
];

export function ContentContainer({ children }: { children: ReactNode }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "");
  const match = WIDTH_BY_PREFIX.find((w) => pathname === w.prefix || pathname.startsWith(`${w.prefix}/`));
  return <div className={clsx("mx-auto w-full", match?.cls ?? "max-w-4xl")}>{children}</div>;
}
