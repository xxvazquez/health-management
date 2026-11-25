import type { ReactNode } from "react";
import type { NoteCategory } from "@/lib/supabase/notes";

/** Same hand-drawn line-icon style as Nav.tsx's IconWrap — 20x20 viewBox,
 * stroke currentColor, round caps/joins — kept local rather than shared
 * since Nav's version isn't exported and these are sized differently
 * (used inline at 14-16px, not the nav rail's fixed 18px). */
function IconWrap({ size = 15, bold = false, children }: { size?: number; bold?: boolean; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={bold ? 2.4 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function NoteIcon(props: { size?: number; bold?: boolean }) {
  return (
    <IconWrap {...props}>
      <path d="M4 5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3H6a2 2 0 0 1-2-2Z" />
    </IconWrap>
  );
}

function ReminderIcon(props: { size?: number; bold?: boolean }) {
  return (
    <IconWrap {...props}>
      <path d="M5 14.5c0-3.5.5-6.5 5-6.5s5 3 5 6.5" />
      <path d="M3.8 14.5h12.4" />
      <path d="M8.7 16.8a1.4 1.4 0 0 0 2.6 0" />
      <path d="M10 5.5V4" />
    </IconWrap>
  );
}

function AppreciationIcon(props: { size?: number; bold?: boolean }) {
  return (
    <IconWrap {...props}>
      <path d="M10 16.2c-4.6-2.8-6.4-5.3-6.4-7.8a3.4 3.4 0 0 1 6.4-1.6 3.4 3.4 0 0 1 6.4 1.6c0 2.5-1.8 5-6.4 7.8Z" />
    </IconWrap>
  );
}

function QuestionIcon(props: { size?: number; bold?: boolean }) {
  return (
    <IconWrap {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M8 8.2a2.1 2.1 0 1 1 3 1.9c-.6.3-1 .7-1 1.5" />
      <path d="M10 14v.1" />
    </IconWrap>
  );
}

const CATEGORY_ICON: Record<NoteCategory, (props: { size?: number; bold?: boolean }) => ReactNode> = {
  note: NoteIcon,
  reminder: ReminderIcon,
  appreciation: AppreciationIcon,
  question: QuestionIcon,
};

/** A message type's symbol; `bold` draws it heavier, for an unread row. */
export function CategoryIcon({ category, size, bold }: { category: NoteCategory; size?: number; bold?: boolean }) {
  const Icon = CATEGORY_ICON[category];
  return <Icon size={size} bold={bold} />;
}

export function StarIcon({ filled, size = 15 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2.6l2.4 4.9 5.4.7-3.9 3.8 1 5.4L10 14.8l-4.9 2.6 1-5.4-3.9-3.8 5.4-.7Z" />
    </svg>
  );
}

export function EyeIcon({ size = 15 }: { size?: number }) {
  return (
    <IconWrap size={size}>
      <path d="M2.5 10S5 5.5 10 5.5 17.5 10 17.5 10 15 14.5 10 14.5 2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </IconWrap>
  );
}

export function EyeOffIcon({ size = 15 }: { size?: number }) {
  return (
    <IconWrap size={size}>
      <path d="M7.3 5.9A7.4 7.4 0 0 1 10 5.5c5 0 7.5 4.5 7.5 4.5a13 13 0 0 1-2.2 2.7M4.7 7.3A13 13 0 0 0 2.5 10S5 14.5 10 14.5a7.4 7.4 0 0 0 2.8-.5" />
      <path d="M8.4 8.4a2.2 2.2 0 0 0 3.1 3.1" />
      <path d="M3.5 3.5 16.5 16.5" />
    </IconWrap>
  );
}
