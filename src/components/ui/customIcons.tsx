import type { ReactNode } from "react";

/** Fixed set of glyphs offered for any user-named grouping's custom icon
 * (Wishlist categories, reminder lists, lab panels, doctor specialties, …)
 * — same thin-stroke 20×20 language as Nav.tsx and the Log page icons.
 * Keyed by a short string stored on that table's `icon` column; the first
 * key (`square`) is the neutral fallback for a null or unrecognized one. */
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
  square: <rect x="4.5" y="4.5" width="11" height="11" rx="2.2" />,
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
  bell: (
    <>
      <path d="M6 8.5a4 4 0 0 1 8 0c0 3 1.2 4.2 1.8 4.8H4.2C4.8 12.7 6 11.5 6 8.5Z" />
      <path d="M8.4 15.2a1.7 1.7 0 0 0 3.2 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="6.3" />
      <path d="M10 6.3V10l2.6 1.6" />
    </>
  ),
  drop: <path d="M10 3.4c2.9 3.9 4.4 6.3 4.4 8.4a4.4 4.4 0 0 1-8.8 0c0-2.1 1.5-4.5 4.4-8.4Z" />,
  activity: <path d="M2.8 10.2h3l1.8-4.4 3.2 8.6 1.9-5.4 1.2 1.6h3.3" />,
  dumbbell: (
    <>
      <path d="M4 7.8v4.4M6 6.3v7.4M14 6.3v7.4M16 7.8v4.4" />
      <path d="M6 10h8" />
    </>
  ),
  bed: (
    <>
      <path d="M3.6 6v10" />
      <path d="M3.6 11.5h12.8V16" />
      <path d="M6.4 11.5V9.3a1.6 1.6 0 0 1 1.6-1.6h5.5a2.9 2.9 0 0 1 2.9 2.9v.9" />
    </>
  ),
  car: (
    <>
      <path d="M4 13.5v-2l1.7-4.3A1.6 1.6 0 0 1 7.2 6.2h5.6a1.6 1.6 0 0 1 1.5 1L16 11.5v2" />
      <path d="M3.6 11.5h12.8" />
      <circle cx="6.8" cy="13.6" r="1.2" />
      <circle cx="13.2" cy="13.6" r="1.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.3" />
      <path d="M10 2.6v2.1M10 15.3v2.1M2.6 10h2.1M15.3 10h2.1M4.8 4.8l1.5 1.5M13.7 13.7l1.5 1.5M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5" />
    </>
  ),
  moon: <path d="M15.5 12.3A6.4 6.4 0 0 1 7.7 4.5 6.4 6.4 0 1 0 15.5 12.3Z" />,
  key: (
    <>
      <circle cx="7" cy="13" r="3.4" />
      <path d="M9.4 10.6 16 4" />
      <path d="M13.4 6.6l1.8 1.8M11.8 8.2l1.6 1.6" />
    </>
  ),
  bag: (
    <>
      <path d="M5.6 7h8.8l.7 9.3H4.9Z" />
      <path d="M7.6 7.5V6a2.4 2.4 0 0 1 4.8 0v1.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.6 10S5.5 5.6 10 5.6 17.4 10 17.4 10 14.5 14.4 10 14.4 2.6 10 2.6 10Z" />
      <circle cx="10" cy="10" r="2.1" />
    </>
  ),
  bottle: (
    <>
      <path d="M8.7 3.6h2.6v1.8l.9 1.5a2 2 0 0 1 .3 1V15a1.6 1.6 0 0 1-1.6 1.6H8.1A1.6 1.6 0 0 1 6.5 15V8.9a2 2 0 0 1 .3-1l.9-1.5Z" />
      <path d="M6.6 10.4h6.8" />
    </>
  ),
  folder: <path d="M3.6 7a1.2 1.2 0 0 1 1.2-1.2h3.1L9.4 7.3h5.8A1.2 1.2 0 0 1 16.4 8.5v5.3a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2Z" />,
  flag: (
    <>
      <path d="M5.5 3.5v13" />
      <path d="M5.5 4.3c3-1.4 5.5.9 8.5-.3v7c-3 1.2-5.5-1.1-8.5.3Z" />
    </>
  ),
  bookmark: <path d="M6 3.8h8v12.4l-4-2.8-4 2.8Z" />,
};

/** Search synonyms per glyph — the icon picker matches a typed query
 * against these (and the key itself), so "meds" finds `pill` and "bloods"
 * finds `flask`. Keep every key in `PATHS` represented. */
export const ICON_SEARCH: Record<string, string> = {
  square: "square box plain default none",
  heart: "heart love like favourite favorite wellbeing",
  home: "home house household place",
  gift: "gift present birthday wishlist celebration",
  travel: "travel plane flight trip holiday vacation",
  cart: "cart shopping trolley groceries buy store",
  book: "book read reading library study journal notes",
  star: "star favourite favorite important priority special",
  sparkle: "sparkle magic special shine new",
  tag: "tag label price category type",
  shirt: "shirt clothes clothing laundry wardrobe dry cleaning",
  tools: "tools wrench repair fix diy maintenance hardware",
  leaf: "leaf plant nature garden eco green plants",
  mug: "mug coffee tea drink cup hot cafe",
  camera: "camera photo picture memory",
  music: "music song audio playlist sound",
  pill: "pill meds medication medicine drug supplement prescription tablet vitamin",
  flask: "flask lab labs test results bloods chemistry sample panel",
  clipboard: "clipboard notes list checklist form doctor intake",
  calendar: "calendar date appointment schedule month event",
  bell: "bell reminder alert notification alarm ping",
  clock: "clock time timer hour schedule watch",
  drop: "drop blood water hydration fluid period liquid",
  activity: "activity pulse heart rate vitals health metrics ecg fitness",
  dumbbell: "dumbbell gym workout exercise weights strength training fitness",
  bed: "bed sleep rest nap bedroom night mattress",
  car: "car drive travel commute errand vehicle transport garage",
  sun: "sun morning day daily sunny weather light summer",
  moon: "moon night evening sleep dark",
  key: "key access password lock login security house car",
  bag: "bag shopping handbag purse tote wishlist buy",
  eye: "eye vision sight optician ophthalmology glasses look",
  bottle: "bottle water supplement drink hydration jug",
  folder: "folder files documents papers organise records admin",
  flag: "flag goal target priority milestone country",
  bookmark: "bookmark save read later mark keep",
};

export const CUSTOM_ICON_KEYS = Object.keys(PATHS);
const DEFAULT_ICON_KEY = "square";

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
