"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { attentionSummary, type AttentionGroup, type AttentionItem } from "@/lib/aggregations/attention";
import { CloseIcon } from "@/components/ui/icons";

const GROUP_ORDER: AttentionGroup[] = ["overdue", "today", "tomorrow", "week", "later"];

const GROUP_LABEL: Record<AttentionGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next 7 days",
  later: "Later",
};

const OVERDUE_INK = "color-mix(in oklab, var(--status-critical) 60%, var(--text-secondary))";

const GROUP_DOT: Record<AttentionGroup, string> = {
  overdue: "var(--status-critical)",
  today: "var(--status-warning)",
  tomorrow: "var(--text-muted)",
  week: "var(--text-muted)",
  later: "var(--text-muted)",
};

const TIMING_COLOR: Record<AttentionGroup, string> = {
  overdue: OVERDUE_INK,
  today: "var(--text-secondary)",
  tomorrow: "var(--text-secondary)",
  week: "var(--text-muted)",
  later: "var(--text-muted)",
};

function Chevron({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg
      className="shrink-0 transition-transform"
      style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none" }}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

/**
 * The one cross-domain list of everything outstanding, at the top of the
 * Overview page — grouped by how soon it needs dealing with (overdue,
 * today, tomorrow, the next week, later) rather than by item type. Each row
 * deep-links to where it's handled and can be dismissed for the session;
 * the whole band and each urgency group collapse independently, and when
 * nothing is outstanding it's just one calm sentence.
 */
export function AttentionBand({ items }: { items: AttentionItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<AttentionGroup>>(new Set());
  const visible = useMemo(() => items.filter((i) => !dismissed.has(i.key)), [items, dismissed]);

  const groups = useMemo(
    () => GROUP_ORDER.map((g) => ({ group: g, rows: visible.filter((i) => i.group === g) })).filter((s) => s.rows.length > 0),
    [visible],
  );

  const toggleGroup = (g: AttentionGroup) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  if (visible.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Nothing needs your attention right now.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Needs attention
        </span>
        {!open && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {attentionSummary(visible)}
          </span>
        )}
        <span className="ml-auto">
          <Chevron open={open} />
        </span>
      </button>

      {open &&
        groups.map(({ group, rows }) => {
          const groupOpen = !collapsedGroups.has(group);
          return (
            <div key={group} className="border-t" style={{ borderColor: "var(--gridline)" }}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                aria-expanded={groupOpen}
                className="flex w-full items-center gap-1.5 px-4 pt-2 pb-1 text-left"
              >
                <span
                  className="text-xs font-semibold tracking-wide uppercase"
                  style={{ color: group === "overdue" ? OVERDUE_INK : "var(--text-muted)" }}
                >
                  {GROUP_LABEL[group]}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {rows.length}
                </span>
                <span className="ml-auto">
                  <Chevron open={groupOpen} size={12} />
                </span>
              </button>
              {groupOpen && (
                <ul className="flex flex-col pb-1">
                  {rows.map((item) => (
                    <li key={item.key} className="group flex items-center gap-2.5 px-4 py-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: GROUP_DOT[item.group] }} aria-hidden="true" />
                      <Link href={item.href} className="min-w-0 flex-1 truncate text-[13px] hover:underline" style={{ color: "var(--text-primary)" }}>
                        {item.label}
                      </Link>
                      {item.when && (
                        <span className="shrink-0 text-xs whitespace-nowrap" style={{ color: TIMING_COLOR[item.group] }}>
                          {item.when}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setDismissed((prev) => new Set(prev).add(item.key))}
                        aria-label={`Dismiss ${item.label}`}
                        className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <CloseIcon size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </div>
  );
}
