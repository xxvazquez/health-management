"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ICONS, isActiveHref } from "@/components/Nav";
import { NAV_LABEL } from "@/components/navLabels";
import { usePartnerLinked } from "@/lib/usePartnerLinked";

/** The primary areas, one tap away on mobile — the same set and order as
 * the desktop sidebar. Household joins only when a partner is linked (as in
 * the sidebar). Messages, Settings, Help, Drive and the account live in the
 * account menu behind the top-bar. Desktop hides this entirely.
 *
 * Transitional: Household folds into Notes in Step 3, and Messages takes
 * this slot back then. */
const ITEMS: { href: string; iconKey: string }[] = [
  { href: "/log", iconKey: "Log" },
  { href: "/agenda", iconKey: "Reminders" },
  { href: "/analytics", iconKey: "Analytics" },
  { href: "/medical", iconKey: "Medical" },
  { href: "/personal", iconKey: "Personal" },
];

const HOUSEHOLD_ITEM = { href: "/home", iconKey: "Household" };

// The tab bar is tighter than the sidebar — "Household" doesn't fit next to
// six siblings at 375px, so /home keeps a shorter label here. Everything
// else matches NAV_LABEL.
const MOBILE_LABEL: Partial<Record<string, string>> = { "/home": "Shared" };

export function BottomNav() {
  const pathname = usePathname();
  const partnerLinked = usePartnerLinked();

  const items = partnerLinked ? [...ITEMS, HOUSEHOLD_ITEM] : ITEMS;

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
      {items.map((item) => {
        const active = isActiveHref(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 pt-2 pb-1 font-medium transition-colors"
            style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            <span
              className={clsx("relative flex h-7 w-11 items-center justify-center rounded-full transition-colors")}
              style={{ background: active ? "var(--page-plane)" : "transparent" }}
            >
              {ICONS[item.iconKey]}
            </span>
            <span className="max-w-full truncate text-xs leading-tight tracking-tight">{MOBILE_LABEL[item.href] ?? NAV_LABEL[item.href]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
