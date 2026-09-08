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
