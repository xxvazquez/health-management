import type { ReactNode } from "react";

/** Small line icons for the Log and Analytics tab bars — same hand-drawn 20×20
 * style as Nav.tsx, sized at 15px to sit inline in the underlined menu.
 * `stroke: currentColor` so each picks up its tab's active/inactive colour. */
function TabIconWrap({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
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

export const TAB_ICON: Record<string, ReactNode> = {
  food: (
    <TabIconWrap>
      <path d="M10 8.2A4.8 4.8 0 1 1 10 17.8 4.8 4.8 0 0 1 10 8.2Z" />
      <path d="M10 8.2V5.4" />
      <path d="M10 5.4c0-1 .8-1.8 2-2" />
    </TabIconWrap>
  ),
  outcome: (
    <TabIconWrap>
      <path d="M2.8 11h3l1.8-5.5 3 10 1.8-4.5h4.8" />
    </TabIconWrap>
  ),
  supplement: (
    <TabIconWrap>
      <rect x="4.2" y="8.7" width="11.6" height="5.1" rx="2.55" transform="rotate(-30 10 11.25)" />
      <path d="M8.5 8.5 11.5 14" />
    </TabIconWrap>
  ),
  habit: (
    <TabIconWrap>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M7 10.2 9.2 12.4 13.2 8" />
    </TabIconWrap>
  ),
  stool: (
    <TabIconWrap>
      <path d="M10 3.2c-3 4.6-5.6 7.6-5.6 10.4a5.6 5.6 0 0 0 11.2 0c0-2.8-2.6-5.8-5.6-10.4Z" />
    </TabIconWrap>
  ),
  digestion: (
    <TabIconWrap>
      <path d="M10 3.2c-3 4.6-5.6 7.6-5.6 10.4a5.6 5.6 0 0 0 11.2 0c0-2.8-2.6-5.8-5.6-10.4Z" />
    </TabIconWrap>
  ),
  patterns: (
    <TabIconWrap>
      <path d="M3.2 14.8 8 10l2.8 2.8 6-6.6" />
      <path d="M12.6 6.2h4.2v4.2" />
    </TabIconWrap>
  ),
  // Plural aliases — the Analytics tab bar keys tabs by "supplements" /
  // "habits" where the Log page uses the singular ItemType.
  supplements: (
    <TabIconWrap>
      <rect x="4.2" y="8.7" width="11.6" height="5.1" rx="2.55" transform="rotate(-30 10 11.25)" />
      <path d="M8.5 8.5 11.5 14" />
    </TabIconWrap>
  ),
  habits: (
    <TabIconWrap>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M7 10.2 9.2 12.4 13.2 8" />
    </TabIconWrap>
  ),
  workout: (
    <TabIconWrap>
      <path d="M3 10h2.4M14.6 10H17" />
      <path d="M5.4 7v6M14.6 7v6" />
      <rect x="5.4" y="8.2" width="9.2" height="3.6" rx="0.8" />
    </TabIconWrap>
  ),
  cycle: (
    <TabIconWrap>
      <path d="M10 3.5c2.9 4.3 5 7.4 5 9.7a5 5 0 0 1-10 0c0-2.3 2.1-5.4 5-9.7Z" />
    </TabIconWrap>
  ),
  journal: (
    <TabIconWrap>
      <path d="M6 3.8h8a1 1 0 0 1 1 1v11.4l-2.5-1.5L10.5 16 8 14.7 5.5 16.2V4.8a1 1 0 0 1 .5-1Z" />
      <path d="M8 7h4M8 9.4h4" />
    </TabIconWrap>
  ),
  notes: (
    <TabIconWrap>
      <path d="M3.5 5.8c0-.7.6-1.3 1.3-1.3h10.4c.7 0 1.3.6 1.3 1.3v8.4c0 .7-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.6-1.3-1.3Z" />
      <path d="M4 6.2l6 5 6-5" />
    </TabIconWrap>
  ),
  reminders: (
    <TabIconWrap>
      <path d="M10 3.4a4 4 0 0 0-4 4c0 3.4-1.3 4.6-1.3 4.6h10.6S14 10.8 14 7.4a4 4 0 0 0-4-4Z" />
      <path d="M8.6 15a1.7 1.7 0 0 0 2.8 0" />
    </TabIconWrap>
  ),
  expiration: (
    <TabIconWrap>
      <rect x="4" y="5.4" width="12" height="10.2" rx="1.3" />
      <path d="M4 8.6h12M7.7 3.8v3M12.3 3.8v3" />
      <path d="M8 11.6 9.4 13l3-3.2" />
    </TabIconWrap>
  ),
};
