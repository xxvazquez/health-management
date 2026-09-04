import type { ReactNode } from "react";
import type { NoteCategory } from "@/lib/supabase/notes";

/** Same hand-drawn line-icon style as Nav.tsx's IconWrap — 20x20 viewBox,
 * stroke currentColor, round caps/joins — kept local rather than shared
 * since Nav's version isn't exported and these are sized differently
 * (used inline at 14-16px, not the nav rail's fixed 18px). */
function IconWrap({ size = 15, children }: { size?: number; children: ReactNode }) {
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

function NoteIcon(props: { size?: number }) {
  return (
    <IconWrap {...props}>
      <path d="M5.5 3.5h9v13l-2.5-1.8-2 1.8-2-1.8-2.5 1.8Z" />
      <path d="M7.5 7h5M7.5 9.5h5" />
    </IconWrap>
  );
}

function ReminderIcon(props: { size?: number }) {
  return (
    <IconWrap {...props}>
      <path d="M5 14.5c0-3.5.5-6.5 5-6.5s5 3 5 6.5" />
      <path d="M3.8 14.5h12.4" />
      <path d="M8.7 16.8a1.4 1.4 0 0 0 2.6 0" />
      <path d="M10 5.5V4" />
    </IconWrap>
  );
}

function AppreciationIcon(props: { size?: number }) {
  return (
    <IconWrap {...props}>
      <path d="M10 16.2c-4.6-2.8-6.4-5.3-6.4-7.8a3.4 3.4 0 0 1 6.4-1.6 3.4 3.4 0 0 1 6.4 1.6c0 2.5-1.8 5-6.4 7.8Z" />
    </IconWrap>
  );
}

function QuestionIcon(props: { size?: number }) {
  return (
    <IconWrap {...props}>
      <path d="M7.3 7.6a2.7 2.7 0 1 1 4.1 2.3c-.9.6-1.4 1-1.4 2.1" />
      <path d="M10 14.9v.1" />
    </IconWrap>
  );
}

const CATEGORY_ICON: Record<NoteCategory, (props: { size?: number }) => ReactNode> = {
  note: NoteIcon,
  reminder: ReminderIcon,
  appreciation: AppreciationIcon,
  question: QuestionIcon,
};

export function CategoryIcon({ category, size }: { category: NoteCategory; size?: number }) {
  const Icon = CATEGORY_ICON[category];
  return <Icon size={size} />;
}

export function StarIcon({ filled, size = 15 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2.6l2.4 4.9 5.4.7-3.9 3.8 1 5.4L10 14.8l-4.9 2.6 1-5.4-3.9-3.8 5.4-.7Z" />
    </svg>
  );
}

export function ArchiveIcon({ size = 15 }: { size?: number }) {
  return (
    <IconWrap size={size}>
      <rect x="3.2" y="4" width="13.6" height="3.2" rx="0.8" />
      <path d="M4.4 7.2v7c0 .7.6 1.3 1.3 1.3h8.6c.7 0 1.3-.6 1.3-1.3v-7" />
      <path d="M8 10.2h4" />
    </IconWrap>
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

export function ReplyIcon({ size = 15 }: { size?: number }) {
  return (
    <IconWrap size={size}>
      <path d="M8.5 6 4 10l4.5 4" />
      <path d="M4 10h7c2.5 0 4.5 2 4.5 4.5" />
    </IconWrap>
  );
}
