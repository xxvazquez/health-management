"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS, isActiveHref } from "@/components/Nav";
import { NAV_LABEL } from "@/components/navLabels";

/** The five primary areas, one tap away on mobile — the same set and order
 * as the desktop sidebar, identical for everyone. Messages is a top-bar
 * icon (paired only), never here, so the bar never shifts. Settings, Help,
 * Drive and the account live in the account menu. Desktop hides this. */
const ITEMS: { href: string; iconKey: string }[] = [
  { href: "/log", iconKey: "Log" },
  { href: "/agenda", iconKey: "Reminders" },
  { href: "/analytics", iconKey: "Analytics" },
  { href: "/medical", iconKey: "Medical" },
  { href: "/personal", iconKey: "Personal" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t lg:hidden"
      style={{
        borderColor: "var(--border-hairline)",
        background: "color-mix(in oklab, var(--surface-1) 92%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {ITEMS.map((item) => {
        const active = isActiveHref(pathname, item.href);
        // Flat, iOS-style: the active tab is the tint colour only — no pill,
        // no fill, no indicator bar.
        const tint = active ? "var(--series-1)" : "var(--text-muted)";
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 pt-2 pb-1 font-medium transition-colors"
            style={{ color: tint }}
          >
            <span className="flex h-7 w-11 items-center justify-center">{ICONS[item.iconKey]}</span>
            <span className="max-w-full truncate text-xs leading-tight tracking-tight">{NAV_LABEL[item.href]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
