"use client";

import clsx from "clsx";

function FeedbackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h12a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H8l-3.5 2.6V13.9H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
      <path d="M10 8.3h.01M7 8.3h.01M13 8.3h.01" />
    </svg>
  );
}

/** Opens the single shared BugReportDialog (rendered once, alongside
 * AccountPanel — see Nav.tsx). Two instances of this button exist, desktop
 * rail and mobile drawer, same as AccountMenuButton. Covers both a bug
 * report and a feature idea, so it reads as neutral feedback rather than
 * an alarm — no red, no bug icon. */
export function BugReportButton({ collapsed, onClick }: { collapsed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Feedback"
      aria-label="Feedback"
      className={clsx(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors hover:bg-[var(--page-plane)]",
        collapsed && "justify-center px-0",
      )}
      style={{ color: "var(--text-muted)" }}
    >
      <FeedbackIcon />
      {!collapsed && "Feedback"}
    </button>
  );
}
