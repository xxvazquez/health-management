"use client";

import clsx from "clsx";

function BugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7.3" width="6" height="7.4" rx="3" />
      <path d="M10 7.3V5.6M7.4 9.4 5 8M12.6 9.4 15 8M7.4 12.2 5 13.6M12.6 12.2 15 13.6M8.2 5.7a1.9 1.9 0 0 1 3.6 0" />
    </svg>
  );
}

/** Opens the single shared BugReportDialog (rendered once, alongside
 * AccountPanel — see Nav.tsx). Two instances of this button exist, desktop
 * rail and mobile drawer, same as AccountMenuButton. */
export function BugReportButton({ collapsed, onClick }: { collapsed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Report a bug"
      aria-label="Report a bug"
      className={clsx(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors hover:bg-[var(--page-plane)]",
        collapsed && "justify-center px-0",
      )}
      style={{ color: "var(--text-muted)" }}
    >
      <BugIcon />
      {!collapsed && "Report a bug"}
    </button>
  );
}
