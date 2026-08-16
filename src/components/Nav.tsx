"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useData } from "@/lib/DataContext";
import { pullFromCloud } from "@/lib/supabase/sync";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/log", label: "Log" },
  { href: "/food", label: "Food" },
  { href: "/supplements", label: "Supplements" },
  { href: "/habits", label: "Habits" },
  { href: "/digestion", label: "Digestion" },
  { href: "/patterns", label: "Patterns" },
];

export function Nav() {
  const pathname = usePathname();
  const { status, refresh } = useData();
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

  return (
    <header
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{ borderColor: "var(--border-hairline)", background: "color-mix(in oklab, var(--surface-1) 90%, transparent)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6 overflow-x-auto">
            <span className="text-sm font-semibold tracking-tight whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              Health Analytics
            </span>
            <nav className="flex items-center gap-1">
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                    )}
                    style={{
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      background: active ? "var(--page-plane)" : "transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {status === "ready" && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ color: "var(--status-good)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-good)" }} />
                Data loaded locally
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap disabled:opacity-50"
              style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
