"use client";

import { useState, type ReactNode } from "react";

/** A row with a value to paste into Shortcuts and a Copy button. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-11 items-center gap-3 px-3.5">
      <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-xs" style={{ color: "var(--text-muted)" }}>
        {value}
      </span>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {})
        }
        className="hit-slop shrink-0 text-sm font-medium"
        style={{ color: "var(--ui-accent)" }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** One numbered step of a setup list. */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-start gap-3 px-3.5 py-2.5 text-sm" style={{ color: "var(--text-primary)" }}>
      <span className="w-4 shrink-0 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
