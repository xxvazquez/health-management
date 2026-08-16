"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { pullFromCloud } from "@/lib/supabase/sync";
import { Logo } from "@/components/Logo";

function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  Overview: (
    <IconWrap>
      <path d="M3 10.5 10 4l7 6.5" />
      <path d="M5 9.5V17h10V9.5" />
      <path d="M8 17v-5h4v5" />
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
};

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/log", label: "Log" },
  { href: "/food", label: "Food" },
  { href: "/supplements", label: "Supplements" },
  { href: "/habits", label: "Habits" },
  { href: "/digestion", label: "Digestion" },
  { href: "/patterns", label: "Patterns" },
];

function NavLinks({ pathname, collapsed, onNavigate }: { pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            title={collapsed ? link.label : undefined}
            className={clsx(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              collapsed && "justify-center px-0",
              !active && "hover:bg-[var(--page-plane)]",
            )}
            style={{
              background: active ? "var(--page-plane)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {ICONS[link.label]}
            {!collapsed && link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SyncFooter({ collapsed }: { collapsed?: boolean }) {
  const { status, isDemoData, refresh } = useData();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      // No-ops locally if not signed in — refresh() still re-reads
      // whatever's already in IndexedDB either way.
      await pullFromCloud();
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t pt-4" style={{ borderColor: "var(--gridline)" }}>
        <span
          title={status === "ready" && isDemoData ? "Viewing demo data" : "Data loaded locally"}
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: status === "ready" && isDemoData ? "var(--status-warning)" : "var(--status-good)" }}
        />
        <button
          type="button"
          title="Refresh"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex h-8 w-8 items-center justify-center rounded-full border disabled:opacity-50"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
            <path d="M16.5 3.5V8H12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t px-1 pt-4" style={{ borderColor: "var(--gridline)" }}>
      {status === "ready" && isDemoData && (
        <Link
          href="/log"
          className="rounded-lg px-2 py-1.5 text-xs font-medium underline decoration-dotted"
          style={{ color: "var(--status-warning)", background: "color-mix(in oklab, var(--status-warning) 14%, transparent)" }}
        >
          Viewing demo data — sign in to see yours
        </Link>
      )}
      {status === "ready" && !isDemoData && (
        <span className="inline-flex items-center gap-1.5 px-2 text-xs font-medium whitespace-nowrap" style={{ color: "var(--status-good)" }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-good)" }} />
          Data loaded locally
        </span>
      )}
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
        className="rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
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
        <Link href="/" className={clsx("flex items-center", collapsed ? "justify-center px-0" : "px-2")}>
          <Logo size={26} />
          {!collapsed && (
            <span className="ml-2 text-lg font-semibold tracking-[0.2em] whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              LAUVA
            </span>
          )}
        </Link>
        <div className="mt-8 flex flex-1 flex-col">
          <NavLinks pathname={pathname} collapsed={collapsed} />
        </div>
        <SyncFooter collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-20 border-b backdrop-blur lg:hidden"
        style={{ borderColor: "var(--border-hairline)", background: "color-mix(in oklab, var(--surface-1) 96%, transparent)" }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h14" />
              <path d="M3 10h14" />
              <path d="M3 14h14" />
            </svg>
          </button>
          <Link href="/" onClick={() => setMobileOpen(false)}>
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
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r px-4 py-6 shadow-xl transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <div className="flex items-center justify-between px-1">
          <Link href="/" onClick={() => setMobileOpen(false)}>
            <Wordmark />
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="mt-6 flex flex-1 flex-col">
          <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </div>
        <SyncFooter />
      </div>
    </>
  );
}
