"use client";

import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

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

/** One numbered step of a setup guide: a single action, with the button
 * names it mentions in bold. */
export function Step({ n, accent = "var(--ui-accent)", children }: { n: number; accent?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-start gap-3 px-3.5 py-2.5 text-sm" style={{ color: "var(--text-primary)" }}>
      <span
        className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
        style={{ color: accent, background: `color-mix(in oklab, ${accent} var(--tint-pct), transparent)` }}
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">Step {n}. </span>
        {children}
      </span>
    </div>
  );
}

/** A request field the shortcut sends: its name and where its value comes from. */
export function FieldRow({ name, value }: { name: string; value: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2 text-sm">
      <span className="font-mono" style={{ color: "var(--text-primary)" }}>
        {name}
      </span>
      <span className="min-w-0 text-right" style={{ color: "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

/** A row that opens a setup guide sheet. */
export function GuideRow({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-sm"
      style={{ color: "var(--text-primary)" }}
    >
      {label}
      <span style={{ color: "var(--text-muted)" }}>
        <ChevronIcon dir="right" size={14} />
      </span>
    </button>
  );
}
