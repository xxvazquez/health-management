/** Shared line glyphs for small controls — the close/clear buttons and the
 * day/month steppers that would otherwise render a raw "✕" / "‹" / "›"
 * text character at whatever weight the surrounding font gives them. Same
 * 20×20 / strokeWidth 1.8 drawing language as the nav and tab-bar icons. */

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function ClockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}

/** A tray with an arrow — down for archive, up for unarchive. */
export function ArchiveIcon({ size = 15, dir = "down" }: { size?: number; dir?: "down" | "up" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 6.5h13M4.5 6.5 5 15a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l.5-8.5" />
      <rect x="3" y="3.5" width="14" height="3" rx="0.8" />
      {dir === "down" ? <path d="M10 8.8v3.4M8.2 10.6 10 12.4l1.8-1.8" /> : <path d="M10 12.4V9M8.2 10.8 10 9l1.8 1.8" />}
    </svg>
  );
}

export function NoteIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3.5" width="12" height="13" rx="1.5" />
      <path d="M7 7.5h6M7 10h6M7 12.5h3.5" />
    </svg>
  );
}

export function CalendarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
      <path d="M3.5 8h13M7 3v3M13 3v3" />
    </svg>
  );
}

const CHEVRON_ROTATION = { right: 0, down: 90, left: 180, up: 270 } as const;

export function ChevronIcon({ dir = "right", size = 16 }: { dir?: keyof typeof CHEVRON_ROTATION; size?: number }) {
  const deg = CHEVRON_ROTATION[dir];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={deg ? { transform: `rotate(${deg}deg)` } : undefined}
    >
      <path d="M7.5 5 12.5 10 7.5 15" />
    </svg>
  );
}
