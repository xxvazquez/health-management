"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ICONS, isActiveHref } from "@/components/Nav";
import { NAV_LABEL } from "@/components/navLabels";
import { useUnreadNoteCount } from "@/lib/useUnreadNoteCount";

/** The primary destinations, one tap away on mobile. Everything else
 * (Manage, My Drive, Help, account, bug report) stays in the drawer behind
 * the top-bar menu. Desktop hides this entirely — the sidebar covers it. */
// Same wording as the desktop sidebar (via NAV_LABEL). `iconKey` also keys
// the shared ICONS map.
const ITEMS: { href: string; iconKey: string }[] = [
  { href: "/overview", iconKey: "Overview" },
  { href: "/log", iconKey: "Log" },
  { href: "/personal", iconKey: "Personal" },
  { href: "/analytics", iconKey: "Analytics" },
  { href: "/home", iconKey: "Household" },
];

// The phone tab bar is tighter than the desktop sidebar — "Household"
// doesn't fit as comfortably as it does there, so /home keeps its own
// shorter label here. Everything else matches NAV_LABEL.
const MOBILE_LABEL: Partial<Record<string, string>> = {
  "/home": "Home",
};

export function BottomNav() {
  const pathname = usePathname();
  const unread = useUnreadNoteCount(pathname);

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
        // "Household" is active for either shared page (/home, /notes).
        const active = isActiveHref(pathname, item.href) || (item.href === "/home" && isActiveHref(pathname, "/notes"));
        const badge = item.href === "/home" ? unread : 0;
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
              {badge > 0 && (
                <span
                  className="absolute top-0.5 right-2 h-2 w-2 rounded-full"
                  style={{ background: "var(--series-magenta)" }}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="max-w-full text-xs leading-tight tracking-tight">{MOBILE_LABEL[item.href] ?? NAV_LABEL[item.href]}</span>
            {badge > 0 && <span className="sr-only">{badge} unread</span>}
          </Link>
        );
      })}
    </nav>
  );
}
