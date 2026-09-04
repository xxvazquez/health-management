/** Canonical display name for each top-level route. Defined once here so
 * the sidebar (Nav), the mobile tab bar (BottomNav) and the bug-report
 * location field all read the same wording and can't drift apart. */
export const NAV_LABEL: Record<string, string> = {
  "/overview": "Overview",
  "/log": "Log",
  "/personal": "Personal",
  "/medical": "Medical",
  "/analytics": "Analytics",
  "/home": "Household",
  "/notes": "Messages",
  "/manage": "Manage items",
  "/my-drive": "My Drive",
  "/help": "Help",
};
