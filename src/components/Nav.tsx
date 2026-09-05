"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { useUnreadNoteCount } from "@/lib/useUnreadNoteCount";
import { usePartnerLinked } from "@/lib/usePartnerLinked";
import { Logo } from "@/components/Logo";
import { AccountMenuButton } from "@/components/auth/AccountMenuButton";
import { AccountPanel } from "@/components/auth/AccountPanel";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BugReportButton } from "@/components/BugReportButton";
import { BugReportDialog } from "@/components/BugReportDialog";
import { NAV_LABEL } from "@/components/navLabels";

function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const ICONS: Record<string, ReactNode> = {
  Overview: (
    <IconWrap>
      <rect x="3.6" y="3.6" width="5.6" height="5.6" rx="1.1" />
      <rect x="10.8" y="3.6" width="5.6" height="5.6" rx="1.1" />
      <rect x="3.6" y="10.8" width="5.6" height="5.6" rx="1.1" />
      <rect x="10.8" y="10.8" width="5.6" height="5.6" rx="1.1" />
    </IconWrap>
  ),
  Log: (
    <IconWrap>
      <path d="M4 16.2V20h3.8L18 9.8a1 1 0 0 0 0-1.4l-2.1-2.1a1 1 0 0 0-1.4 0L4 16.2Z" />
    </IconWrap>
  ),
  Food: (
    <IconWrap>
      <path d="M10 8.2A4.8 4.8 0 1 1 10 17.8 4.8 4.8 0 0 1 10 8.2Z" />
      <path d="M10 8.2V5.4" />
      <path d="M10 5.4c0-1 .8-1.8 2-2" />
    </IconWrap>
  ),
  Supplements: (
    <IconWrap>
      <rect x="4.2" y="8.7" width="11.6" height="5.1" rx="2.55" transform="rotate(-30 10 11.25)" />
      <path d="M8.5 8.5 11.5 14" />
    </IconWrap>
  ),
  Habits: (
    <IconWrap>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M7 10.2 9.2 12.4 13.2 8" />
    </IconWrap>
  ),
  Digestion: (
    <IconWrap>
      <path d="M10 3.2c-3 4.6-5.6 7.6-5.6 10.4a5.6 5.6 0 0 0 11.2 0c0-2.8-2.6-5.8-5.6-10.4Z" />
    </IconWrap>
  ),
  Patterns: (
    <IconWrap>
      <path d="M3.2 14.8 8 10l2.8 2.8 6-6.6" />
      <path d="M12.6 6.2h4.2v4.2" />
    </IconWrap>
  ),
  Workout: (
    <IconWrap>
      <path d="M3 10h2.4M14.6 10H17" />
      <path d="M5.4 7v6M14.6 7v6" />
      <rect x="5.4" y="8.2" width="9.2" height="3.6" rx="0.8" />
    </IconWrap>
  ),
  Cycle: (
    <IconWrap>
      <path d="M10 3.5c2.9 4.3 5 7.4 5 9.7a5 5 0 0 1-10 0c0-2.3 2.1-5.4 5-9.7Z" />
    </IconWrap>
  ),
  "Manage items": (
    <IconWrap>
      <path d="M6 5.5h8M6 10h8M6 14.5h5" />
      <circle cx="15.2" cy="14.5" r="1.4" />
    </IconWrap>
  ),
  "My Drive": (
    <IconWrap>
      <path d="M3.5 6.7c0-.8.6-1.4 1.4-1.4h4l1.6 1.8h4.6c.8 0 1.4.6 1.4 1.4v6.1c0 .8-.6 1.4-1.4 1.4H4.9c-.8 0-1.4-.6-1.4-1.4Z" />
    </IconWrap>
  ),
  Notes: (
    <IconWrap>
      <path d="M3.5 5.8c0-.7.6-1.3 1.3-1.3h10.4c.7 0 1.3.6 1.3 1.3v8.4c0 .7-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.6-1.3-1.3Z" />
      <path d="M4 6.2l6 5 6-5" />
    </IconWrap>
  ),
  Reminders: (
    <IconWrap>
      <path d="M10 3.4a4 4 0 0 0-4 4c0 3.4-1.3 4.6-1.3 4.6h10.6S14 10.8 14 7.4a4 4 0 0 0-4-4Z" />
      <path d="M8.6 15a1.7 1.7 0 0 0 2.8 0" />
    </IconWrap>
  ),
  Household: (
    <IconWrap>
      <path d="M4 9.8 10 4.8l6 5" />
      <path d="M5.6 8.6V15.8h8.8V8.6" />
      <path d="M10 13.7c1.7-1.1 2.6-2.1 2.6-3.1a1.4 1.4 0 0 0-2.6-.7 1.4 1.4 0 0 0-2.6.7c0 1 .9 2 2.6 3.1Z" />
    </IconWrap>
  ),
  Analytics: (
    <IconWrap>
      <path d="M4 16.5V10M8 16.5V5M12 16.5v-4M16 16.5V8" />
    </IconWrap>
  ),
  Shared: (
    <IconWrap>
      <circle cx="7" cy="8" r="2.4" />
      <circle cx="13" cy="8" r="2.4" />
      <path d="M3.5 16c.4-2.3 1.9-3.6 3.5-3.6 1 0 1.9.5 2.6 1.3" />
      <path d="M10.4 13.7c.7-.8 1.6-1.3 2.6-1.3 1.6 0 3.1 1.3 3.5 3.6" />
    </IconWrap>
  ),
  Personal: (
    <IconWrap>
      <path d="M5.5 3.5h7.2a1.3 1.3 0 0 1 1.3 1.3v11.4l-4.9-2.3-4.9 2.3V4.8A1.3 1.3 0 0 1 5.5 3.5Z" />
      <path d="M8 7h4M8 9.5h4" />
    </IconWrap>
  ),
  Messages: (
    <IconWrap>
      <path d="M4 5.2h12a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H8l-3.5 2.6V13.6H4a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1Z" />
    </IconWrap>
  ),
  Medical: (
    <IconWrap>
      <path d="M6 3.5v3.6a4 4 0 0 0 8 0V3.5" />
      <path d="M10 11.1v2.4a3 3 0 0 0 6 0v-1.2" />
      <circle cx="16" cy="10.3" r="1.6" />
    </IconWrap>
  ),
  Help: (
    <IconWrap>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M7.8 8a2.2 2.2 0 1 1 3.1 2c-.7.5-1 .9-1 1.7" />
      <path d="M10 14.3h.01" />
    </IconWrap>
  ),
};

export interface NavItem {
  href: string;
  label: string;
  /** Key into the shared `ICONS` map. */
  iconKey: string;
}

/** The primary areas — one flat list, no sub-groups, identical on the
 * desktop sidebar and the mobile bottom bar (BottomNav reads the same
 * order). Routes keep their old URLs through the restructure; only the
 * display names moved (Overview→Agenda, Analytics→Trends, Medical→Health,
 * Personal→Notes). Manage / Help / My Drive dropped out of here into the
 * account menu. */
const PRIMARY_LINKS: NavItem[] = [
  { href: "/log", label: NAV_LABEL["/log"], iconKey: "Log" },
  { href: "/overview", label: NAV_LABEL["/overview"], iconKey: "Reminders" },
  { href: "/analytics", label: NAV_LABEL["/analytics"], iconKey: "Analytics" },
  { href: "/medical", label: NAV_LABEL["/medical"], iconKey: "Medical" },
  { href: "/personal", label: NAV_LABEL["/personal"], iconKey: "Personal" },
];

/** Partner messaging — only appears in the nav once a partner is linked
 * (the feature does nothing without one). */
const MESSAGES_LINK: NavItem = { href: "/notes", label: NAV_LABEL["/notes"], iconKey: "Messages" };

/** `next.config.ts` sets `trailingSlash: true`, so `usePathname()` returns
 * `/log/` while our link hrefs are `/log` — compare without the slash. */
export function isActiveHref(pathname: string, href: string): boolean {
  return pathname.replace(/\/+$/, "") === href.replace(/\/+$/, "");
}

function NavLinkList({
  items,
  pathname,
  collapsed,
  onNavigate,
  badges,
}: {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Unread-style count per href — a small pill next to the icon/label
   * (or a bare dot when collapsed, since there's no room for a number). */
  badges?: Record<string, number>;
}) {
  return (
    <>
      {items.map((item) => {
        const active = isActiveHref(pathname, item.href);
        const badge = badges?.[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "tap-target relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors lg:py-1.5",
              collapsed && "justify-center px-0",
              !active && "hover:bg-[var(--page-plane)]",
            )}
            style={{
              background: active ? "var(--page-plane)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {ICONS[item.iconKey]}
            {!collapsed && item.label}
            {badge > 0 &&
              (collapsed ? (
                <span
                  className="absolute top-1.5 right-3.5 h-2 w-2 rounded-full"
                  style={{ background: "var(--series-magenta)" }}
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white tabular-nums"
                  style={{ background: "var(--series-magenta)" }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ))}
          </Link>
        );
      })}
    </>
  );
}

function NavLinks({ pathname, collapsed, onNavigate }: { pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  const unreadNotes = useUnreadNoteCount(pathname);
  const partnerLinked = usePartnerLinked();

  const items = partnerLinked ? [...PRIMARY_LINKS, MESSAGES_LINK] : PRIMARY_LINKS;

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      <NavLinkList items={items} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} badges={{ "/notes": unreadNotes }} />
    </nav>
  );
}

/** Pure status indicator — data syncs automatically (on sign-in, on every
 * page load, on tab focus), so there's nothing left here to trigger
 * manually. Just says what's currently on screen. */
function SyncFooter({ collapsed }: { collapsed?: boolean }) {
  const { status, isDemoData } = useData();
  if (status !== "ready") return null;

  const label = isDemoData ? "Viewing demo data" : "Data loaded locally";
  const color = isDemoData ? "var(--status-warning)" : "var(--status-good)";

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-t pt-4" style={{ borderColor: "var(--gridline)" }}>
        <span title={label} className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      </div>
    );
  }

  return (
    <div className="border-t px-1 pt-4" style={{ borderColor: "var(--gridline)" }}>
      <span className="inline-flex items-center gap-1.5 px-2 text-xs font-medium whitespace-nowrap" style={{ color }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        {label}
      </span>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Logo size={24} />
      <span className="text-base font-semibold tracking-[0.2em] whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
        LAUVA
      </span>
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — collapsible to an icon rail */}
      <aside
        className={clsx(
          "sticky top-0 relative hidden h-screen shrink-0 flex-col border-r py-6 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px] px-3" : "w-60 px-4",
        )}
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <button
          type="button"
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          onClick={() => setCollapsed((v) => !v)}
          className="absolute top-8 -right-3 flex h-6 w-6 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={collapsed ? "M4 2l4 4-4 4" : "M8 2 4 6l4 4"} />
          </svg>
        </button>
        <Link href="/log" className={clsx("flex items-center", collapsed ? "justify-center px-0" : "px-2")}>
          <Logo size={26} />
          {!collapsed && (
            <span className="ml-2 text-lg font-semibold tracking-[0.2em] whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              LAUVA
            </span>
          )}
        </Link>
        <div className={clsx("mt-5 flex items-center gap-2", collapsed ? "flex-col justify-center" : "px-1")}>
          <AccountMenuButton collapsed={collapsed} />
          <SignOutButton />
        </div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NavLinks pathname={pathname} collapsed={collapsed} />
        </div>
        <BugReportButton collapsed={collapsed} onClick={() => setBugReportOpen(true)} />
        <SyncFooter collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-20 border-b backdrop-blur lg:hidden"
        style={{
          borderColor: "var(--border-hairline)",
          background: "color-mix(in oklab, var(--surface-1) 96%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h14" />
              <path d="M3 10h14" />
              <path d="M3 14h14" />
            </svg>
          </button>
          <Link href="/log" onClick={() => setMobileOpen(false)}>
            <Wordmark />
          </Link>
        </div>
      </header>

      {/* Mobile drawer: slides in from the left over the page, never pushes content down */}
      <div
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
        className={clsx(
          "fixed inset-0 z-30 bg-black/30 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r px-4 shadow-xl transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          borderColor: "var(--border-hairline)",
          background: "var(--surface-1)",
          paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
          paddingLeft: "calc(env(safe-area-inset-left) + 1rem)",
        }}
      >
        <div className="flex items-center justify-between px-1">
          <Link href="/log" onClick={() => setMobileOpen(false)}>
            <Wordmark />
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="mt-5 flex items-center gap-2 px-1">
          <AccountMenuButton onOpen={() => setMobileOpen(false)} />
          <SignOutButton />
        </div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </div>
        <BugReportButton onClick={() => setBugReportOpen(true)} />
        <SyncFooter />
      </div>

      <AccountPanel />
      <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
    </>
  );
}
