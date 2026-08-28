import type { ReactNode } from "react";

/**
 * Simple, stylized line-art for each Bristol Stool Scale type — same
 * thin-stroke icon language as the Food category icons on the Log page,
 * not a literal/clinical illustration. Loosely follows the standard
 * descriptions (separate hard lumps → sausage-shaped, cracked → smooth
 * sausage → soft blobs → mushy, ragged edges → liquid, no solid pieces)
 * just enough to be visually distinct and recognizable at a glance.
 */
function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const BRISTOL_ICON: Record<number, ReactNode> = {
  1: (
    <IconWrap>
      <circle cx="8" cy="12" r="2.6" />
      <circle cx="14.5" cy="10" r="2.6" />
      <circle cx="19.5" cy="14" r="2.3" />
      <circle cx="12" cy="17.5" r="2.3" />
    </IconWrap>
  ),
  2: (
    <IconWrap>
      <path d="M6 14c0-2.5 2-4.5 4.5-4.5S15 11.5 15 14s-2 4.5-4.5 4.5S6 16.5 6 14Z" />
      <path d="M14 12.5c0-1.8 1.6-3.2 3.6-3.2S21 10.7 21 12.5s-1.6 3.2-3.4 3.2-3.6-1.4-3.6-3.2Z" />
      <path d="M9.5 10.5 8.5 9M13.5 15 14.5 16.5" />
    </IconWrap>
  ),
  3: (
    <IconWrap>
      <rect x="4.5" y="10.5" width="19" height="7" rx="3.5" />
      <path d="M9.5 11.5 8.7 16M14 10.7 13.2 17.3M18.5 11.2 17.8 16.8" />
    </IconWrap>
  ),
  4: (
    <IconWrap>
      <rect x="4.5" y="10.5" width="19" height="7" rx="3.5" />
    </IconWrap>
  ),
  5: (
    <IconWrap>
      <path d="M6 15c-.5-2 1-4 3.2-4s3.6 1.8 3.4 4-2 3.5-3.6 3.5S5.5 17 6 15Z" />
      <path d="M13.5 13.5c-.4-1.7 1-3.3 2.9-3.3s3.2 1.5 3 3.3-1.8 3-3.2 3-2.3-1.3-2.7-3Z" />
      <path d="M18.5 17c-.3-1.3.8-2.5 2.2-2.5s2.4 1.1 2.2 2.5-1.4 2.3-2.4 2.3-1.7-1-2-2.3Z" />
    </IconWrap>
  ),
  6: (
    <IconWrap>
      <path d="M5 15.5c-.3-1 .3-2 1.5-2.3-.3-1.2.6-2.4 2-2.2.2-1.3 1.7-2 2.8-1.2.8-1 2.4-.8 3 .3 1.2-.5 2.6.4 2.6 1.7 1.3.1 2.1 1.4 1.6 2.6 1 .5 1.1 2-.1 2.6-4.4 1.4-9 1.6-13.4-.1-.3-.1-.6-.4-.7-.7Z" />
    </IconWrap>
  ),
  7: (
    <IconWrap>
      <path d="M4 11c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
      <path d="M4 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
      <path d="M4 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
    </IconWrap>
  ),
};

export function BristolIcon({ score }: { score: number }) {
  return BRISTOL_ICON[score] ?? null;
}
