"use client";

import { BristolIcon } from "@/components/icons/BristolIcons";
import { ChevronIcon } from "@/components/ui/icons";
import type { RawStoolLog } from "@/lib/types";

/** The most recent bowel movement on or before `date` — Summary reads back
 * the day being viewed, so a past day never shows a later entry. */
export function lastStoolOnOrBefore(stoolLogs: RawStoolLog[], date: string): RawStoolLog | null {
  let last: RawStoolLog | null = null;
  for (const s of stoolLogs) {
    if (s.date > date) continue;
    if (!last || s.date > last.date || (s.date === last.date && s.loggedAt > last.loggedAt)) last = s;
  }
  return last;
}

/** Plain words for the standard Bristol bands (1–2 hard, 3–4 normal, 5–7
 * loose), one per band present — a mixed movement reads "Hard, Normal". */
export function bristolHeadline(scores: number[]): string {
  const bands: string[] = [];
  for (const s of [...scores].sort((a, b) => a - b)) {
    const band = s <= 2 ? "Hard" : s <= 4 ? "Normal" : "Loose";
    if (!bands.includes(band)) bands.push(band);
  }
  return `${scores.length > 1 ? "Types" : "Type"} ${scores.join(", ")} · ${bands.join(", ")}`;
}

/** Apple Health-style highlight: the latest reading, when it happened and
 * what it was like, tapping through to its section. */
export function LastStoolCard({
  entry,
  dateLabel,
  accent,
  onOpen,
}: {
  entry: RawStoolLog;
  /** "Today", "Yesterday" or a short date — the page's own wording. */
  dateLabel: string;
  accent: string;
  onOpen: () => void;
}) {
  const time = new Date(entry.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const details = [entry.color, entry.floatation, ...entry.characteristics, ...entry.symptoms].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left lg:max-w-xl"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ color: accent, background: `color-mix(in oklab, ${accent} var(--tint-pct), transparent)` }}
        aria-hidden="true"
      >
        <BristolIcon score={entry.bristolScores[0]} size={26} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold" style={{ color: accent }}>
            Last bowel movement
          </span>
          <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {dateLabel}, {time}
          </span>
        </span>
        <span className="mt-0.5 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {bristolHeadline(entry.bristolScores)}
        </span>
        {details && (
          <span className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
            {details}
          </span>
        )}
      </span>
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        <ChevronIcon dir="right" size={14} />
      </span>
    </button>
  );
}
