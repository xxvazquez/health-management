import type { ReactNode } from "react";

/** Fixed set of glyphs offered for any user-named grouping's custom icon
 * (Wishlist categories, reminder lists, lab panels, doctor specialties, …)
 * — same thin-stroke 20×20 language as Nav.tsx and the Log page icons.
 * Keyed by a short string stored on that table's `icon` column; the first
 * key (`heart`) is the fallback for a null or unrecognized one. */
function Glyph({ children, size }: { children: ReactNode; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  heart: <path d="M10 16.5S4 12.8 4 8.6A3.1 3.1 0 0 1 10 7a3.1 3.1 0 0 1 6 1.6c0 4.2-6 7.9-6 7.9Z" />,
  home: (
    <>
      <path d="M3.5 9.5 10 4l6.5 5.5" />
      <path d="M5.5 8.6V16h9V8.6" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="8.5" width="12" height="7.5" rx="1" />
      <path d="M3.3 8.5h13.4M10 8.5V16" />
      <path d="M10 8.5C7.8 8.5 6.3 7.9 6.3 6.4S8 4.6 10 8.5Zm0 0c2.2 0 3.7-.6 3.7-2.1S12 4.6 10 8.5Z" />
    </>
  ),
  travel: (
    <>
      <path d="M17.5 3.5 2.8 9.1l5.6 2.3 2.3 5.6z" />
      <path d="M17.5 3.5 8.4 11.4" />
    </>
  ),
  cart: (
    <>
      <circle cx="8" cy="16.4" r="1.1" />
      <circle cx="14.4" cy="16.4" r="1.1" />
      <path d="M3 4h2l2 9.4h8.2L18 6.6H6" />
    </>
  ),
  book: (
    <>
      <path d="M10 6c-1.5-1.2-3.7-1.6-6-1.3v9.5c2.3-.3 4.5.1 6 1.3 1.5-1.2 3.7-1.6 6-1.3V4.7c-2.3-.3-4.5.1-6 1.3Z" />
      <path d="M10 6v9.5" />
    </>
  ),
  star: <path d="M10 3.4l2 4.3 4.7.6-3.5 3.2.9 4.6L10 13.9l-4.1 2.2.9-4.6L3.3 8.3l4.7-.6z" />,
  sparkle: (
    <>
      <path d="M9.5 3.3c.6 3 1.6 4 4.6 4.6-3 .6-4 1.6-4.6 4.6-.6-3-1.6-4-4.6-4.6 3-.6 4-1.6 4.6-4.6Z" />
      <path d="M14.7 12.7c.3 1.4.7 1.8 2.1 2.1-1.4.3-1.8.7-2.1 2.1-.3-1.4-.7-1.8-2.1-2.1 1.4-.3 1.8-.7 2.1-2.1Z" />
    </>
  ),
  tag: (
    <>
      <path d="M4 4h5.6l6.4 6.4-5.6 5.6L4 9.6Z" />
      <circle cx="7.2" cy="7.2" r="1.1" />
    </>
  ),
  shirt: <path d="M7 4 3.8 6.6 5.6 9 7 7.9V16h6V7.9L14.4 9l1.8-2.4L13 4c-.7.9-1.8 1.5-3 1.5S7.7 4.9 7 4Z" />,
  tools: (
    <path d="M13.6 3.4a3.4 3.4 0 0 0-4.1 5.3l-5.4 5.4a1.7 1.7 0 0 0 2.4 2.4l5.4-5.4a3.4 3.4 0 0 0 4.3-4.3l-2 2-2.2-.4-.4-2.2z" />
  ),
  leaf: (
    <>
      <path d="M5 15.5c-1.2-6.5 3-11 11.5-10.5C17 13 12.5 17.5 5 15.5Z" />
      <path d="M5 15.5c2-3.5 5-6 8.5-7.2" />
    </>
  ),
  mug: (
    <>
      <path d="M5 6h9v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M14 8h1.8a1.8 1.8 0 0 1 0 3.6H14" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="6.5" width="14" height="9.5" rx="1.8" />
      <circle cx="10" cy="11.2" r="2.6" />
      <path d="M7.2 6.5 8.1 4.8h3.8l.9 1.7" />
    </>
  ),
  music: (
    <>
      <path d="M8 14V5.3l7-1.5V12" />
      <circle cx="6" cy="14.2" r="2" />
      <circle cx="13" cy="12.7" r="2" />
    </>
  ),
  pill: (
    <>
      <rect x="3.5" y="8.3" width="13" height="6.4" rx="3.2" transform="rotate(-30 10 11.5)" />
      <path d="M9.3 8.5 12 13.5" />
    </>
  ),
  flask: (
    <>
      <path d="M8.3 3.5h3.4M8.7 3.5v4.6L5 14.8a1.4 1.4 0 0 0 1.2 2.1h7.6a1.4 1.4 0 0 0 1.2-2.1L11.3 8.1V3.5" />
      <path d="M7 12.5h6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="4.5" y="4.5" width="11" height="13" rx="1.3" />
      <path d="M7.5 4.5V3.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.7" />
      <path d="M7.3 9.5h5.4M7.3 12.5h5.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.4" width="12" height="10.2" rx="1.3" />
      <path d="M4 8.6h12M7.7 3.8v3M12.3 3.8v3" />
    </>
  ),
};

export const CUSTOM_ICON_KEYS = Object.keys(PATHS);
const DEFAULT_ICON_KEY = "heart";

export function CustomIcon({ icon, size = 15 }: { icon: string | null; size?: number }) {
  return <Glyph size={size}>{PATHS[icon ?? ""] ?? PATHS[DEFAULT_ICON_KEY]}</Glyph>;
}

/** Brand series hues offered as a per-grouping colour. The key is stored
 * in that table's `color` column; the value is the CSS variable used to
 * paint the glyph, accents and that grouping's forms. */
export const CUSTOM_COLOR_CHOICES: { key: string; value: string }[] = [
  { key: "series-1", value: "var(--series-1)" },
  { key: "series-2", value: "var(--series-2)" },
  { key: "series-8", value: "var(--series-8)" },
  { key: "series-3", value: "var(--series-3)" },
  { key: "series-6", value: "var(--series-6)" },
  { key: "series-4", value: "var(--series-4)" },
  { key: "series-indigo", value: "var(--series-indigo)" },
  { key: "series-magenta", value: "var(--series-magenta)" },
  { key: "series-berry", value: "var(--series-berry)" },
  { key: "series-slate", value: "var(--series-slate)" },
];

export function customColorValue(key: string | null): string | null {
  return CUSTOM_COLOR_CHOICES.find((c) => c.key === key)?.value ?? null;
}

/** The optional icon/colour a create-call can set up front — shared shape
 * across every user-named grouping's Supabase module. */
export interface CustomAppearance {
  icon?: string | null;
  color?: string | null;
}
