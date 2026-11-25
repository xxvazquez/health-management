import type { ReactNode } from "react";

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
