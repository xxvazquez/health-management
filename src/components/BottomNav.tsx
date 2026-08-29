"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ICONS, isActiveHref } from "@/components/Nav";
import { useUnreadNoteCount } from "@/lib/useUnreadNoteCount";

/** The primary destinations, one tap away on mobile. Everything else
 * (Manage, My Drive, Help, account, bug report) stays in the drawer behind
 * the top-bar menu. Desktop hides this entirely — the sidebar covers it. */
const ITEMS: { href: string; label: string }[] = [
  { href: "/overview", label: "Overview" },
  { href: "/log", label: "Log" },
  { href: "/personal", label: "Personal" },
  { href: "/analytics", label: "Analytics" },
  { href: "/home", label: "Shared" },
];

export function BottomNav() {
  const pathname = usePathname();
  const unread = useUnreadNoteCount(pathname);

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-20 flex border-t lg:hidden"
      style={{
        borderColor: "var(--border-hairline)",
        background: "color-mix(in oklab, var(--surface-1) 96%, transparent)",
        backdropFilter: "blur(8px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {ITEMS.map((item) => {
        // "Shared" is active for either of its two pages (/home, /notes).
        const active = isActiveHref(pathname, item.href) || (item.href === "/home" && isActiveHref(pathname, "/notes"));
        const badge = item.href === "/home" ? unread : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors"
            style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            <span
              className={clsx("relative flex h-7 w-11 items-center justify-center rounded-full transition-colors")}
              style={{ background: active ? "var(--page-plane)" : "transparent" }}
            >
              {ICONS[item.label]}
              {badge > 0 && (
                <span
                  className="absolute top-0.5 right-2 h-2 w-2 rounded-full"
                  style={{ background: "var(--series-magenta)" }}
                  aria-hidden="true"
                />
              )}
            </span>
            {item.label}
            {badge > 0 && <span className="sr-only">{badge} unread</span>}
          </Link>
        );
      })}
    </nav>
  );
}
