"use client";

import { useState } from "react";
import Link from "next/link";
import { attentionSummary, type AttentionItem, type AttentionTier } from "@/lib/aggregations/attention";

const TIER_DOT: Record<AttentionTier, string> = {
  overdue: "var(--status-critical)",
  today: "var(--status-warning)",
  soon: "var(--text-muted)",
};

/**
 * The one cross-domain list of everything outstanding, at the top of the
 * Overview page. Each row deep-links to where it's actually handled and can
 * be dismissed for the session; when nothing is outstanding the whole band
 * collapses to one calm line.
 */
const COLLAPSED_COUNT = 6;

export function AttentionBand({ items }: { items: AttentionItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const visible = items.filter((i) => !dismissed.has(i.key));
  const shown = expanded ? visible : visible.slice(0, COLLAPSED_COUNT);
  const hiddenCount = visible.length - shown.length;

  if (visible.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Nothing needs your attention right now.
      </p>
    );
  }

  const tone = visible.some((i) => i.tier === "overdue")
    ? "var(--status-critical)"
    : visible.some((i) => i.tier === "today")
      ? "var(--status-warning)"
      : "var(--text-muted)";

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: `color-mix(in oklab, ${tone} 32%, var(--border-hairline))`,
        background: `color-mix(in oklab, ${tone} 6%, var(--surface-1))`,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b px-4 py-2.5" style={{ borderColor: "var(--gridline)" }}>
        <span className="text-xs font-semibold" style={{ color: tone }}>
          Needs attention
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {attentionSummary(visible)}
        </span>
      </div>
      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
        {shown.map((item) => (
          <li key={item.key} className="group flex items-center gap-3 px-4 py-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TIER_DOT[item.tier] }} aria-hidden="true" />
            <Link href={item.href} className="min-w-0 flex-1 truncate text-sm hover:underline" style={{ color: "var(--text-primary)" }}>
              {item.label}
            </Link>
            <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
              {item.context}
            </span>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(item.key))}
              aria-label={`Dismiss ${item.label}`}
              className="shrink-0 rounded p-1 text-xs leading-none transition-colors hover:bg-[var(--page-plane)]"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {(hiddenCount > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t px-4 py-2 text-left text-xs font-medium"
          style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
