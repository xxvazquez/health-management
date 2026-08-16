"use client";

import { useState, type ReactNode } from "react";

/**
 * The one place a page's methodology/disclaimer text lives — collapsed by
 * default, opened on demand. Replaces the old pattern of repeating "this
 * is descriptive, not diagnostic" (reworded) inside every card on the
 * page: the distinction still matters and stays available, it just isn't
 * part of the page's default visual rhythm anymore.
 */
export function Methodology({ children, label = "How this is calculated" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs underline decoration-dotted"
        style={{ color: "var(--text-muted)" }}
      >
        {open ? "Hide methodology" : label}
      </button>
      {open && (
        <p className="mt-1.5 max-w-2xl text-xs" style={{ color: "var(--text-muted)" }}>
          {children}
        </p>
      )}
    </div>
  );
}
