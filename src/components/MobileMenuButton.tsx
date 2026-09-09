"use client";

import { usePathname } from "next/navigation";
import { useMobileMenu } from "@/components/MobileMenuProvider";
import { useUnreadNoteCount } from "@/lib/useUnreadNoteCount";

/** The one escape hatch to Settings / Help / My Drive / the account, on
 * mobile — the drawer's trigger, sitting at the trailing edge of every
 * screen's title row. Desktop has the sidebar, so this is `lg:hidden`.
 * A dot shows when a linked partner has sent unread messages (which live
 * inside the drawer now). */
export function MobileMenuButton() {
  const { open } = useMobileMenu();
  const pathname = usePathname();
  const unread = useUnreadNoteCount(pathname);

  return (
    <button
      type="button"
      onClick={open}
      aria-label={unread > 0 ? `Open menu, ${unread} unread message${unread === 1 ? "" : "s"}` : "Open menu"}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full lg:hidden"
      style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 6h14" />
        <path d="M3 10h14" />
        <path d="M3 14h14" />
      </svg>
      {unread > 0 && (
        <span
          className="absolute top-1 right-1 h-2 w-2 rounded-full ring-2"
          style={{ background: "var(--series-magenta)", ["--tw-ring-color" as string]: "var(--page-plane)" }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
