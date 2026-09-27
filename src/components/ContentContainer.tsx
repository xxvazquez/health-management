"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";

/** Content width by page type, not a wide/narrow allow-list. Every page
 * starts at the same left edge beside the sidebar, whatever its width, so
 * the title never shifts sideways when switching pages.
 *
 * - **max-w-2xl** — a single reading column: partner messages.
 * - **720px** — Agenda's list.
 * - **max-w-3xl** — plain documentation: Help.
 * - **max-w-6xl** — the page genuinely uses the width: Log's tap-grid and
 *   the Trends dashboards.
 * - **max-w-4xl** (default) — everything else: one readable column of
 *   cards, lists, a chart or a board.
 */
const WIDTH_BY_PREFIX: { prefix: string; cls: string }[] = [
  { prefix: "/notes", cls: "max-w-2xl" },
  { prefix: "/help", cls: "max-w-3xl" },
  { prefix: "/log", cls: "max-w-6xl" },
  { prefix: "/agenda", cls: "max-w-[720px]" },
  { prefix: "/analytics", cls: "max-w-6xl" },
];

export function ContentContainer({ children }: { children: ReactNode }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "");
  const match = WIDTH_BY_PREFIX.find((w) => pathname === w.prefix || pathname.startsWith(`${w.prefix}/`));
  return <div className={clsx("w-full", match?.cls ?? "max-w-4xl")}>{children}</div>;
}
