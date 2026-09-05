"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ICONS, isActiveHref } from "@/components/Nav";
import { NAV_LABEL } from "@/components/navLabels";
import { useUnreadNoteCount } from "@/lib/useUnreadNoteCount";
import { usePartnerLinked } from "@/lib/usePartnerLinked";

/** The primary areas, one tap away on mobile — the same set and order as
 * the desktop sidebar. Messages joins only when a partner is linked (as in
 * the sidebar). Everything else (Settings, Help, Drive, account) lives in
 * the account menu behind the top-bar. Desktop hides this entirely. */
const ITEMS: { href: string; iconKey: string }[] = [
  { href: "/log", iconKey: "Log" },
  { href: "/overview", iconKey: "Reminders" },
  { href: "/analytics", iconKey: "Analytics" },
  { href: "/medical", iconKey: "Medical" },
  { href: "/personal", iconKey: "Personal" },
];

const MESSAGES_ITEM = { href: "/notes", iconKey: "Messages" };

export function BottomNav() {
  const pathname = usePathname();
  const unread = useUnreadNoteCount(pathname);
  const partnerLinked = usePartnerLinked();

  const items = partnerLinked ? [...ITEMS, MESSAGES_ITEM] : ITEMS;

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
        const badge = item.href === "/notes" ? unread : 0;
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
            <span className="max-w-full truncate text-xs leading-tight tracking-tight">{NAV_LABEL[item.href]}</span>
            {badge > 0 && <span className="sr-only">{badge} unread</span>}
          </Link>
        );
      })}
    </nav>
  );
}
