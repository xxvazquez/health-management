/** Canonical display name for each top-level route. Defined once here so
 * the sidebar (Nav), the mobile tab bar (BottomNav) and the bug-report
 * location field all read the same wording and can't drift apart.
 *
 * The routes keep their old URLs through the restructure — only the
 * display names change (`/analytics` → "Trends", `/medical` → "Health",
 * `/overview` → "Agenda", `/personal` → "Notes"). `/home` (Household) and
 * the account-menu utilities keep their names until their step. */
export const NAV_LABEL: Record<string, string> = {
  "/log": "Log",
  "/overview": "Agenda",
  "/analytics": "Trends",
  "/medical": "Health",
  "/personal": "Notes",
  "/notes": "Messages",
  "/home": "Household",
  "/manage": "Settings",
  "/my-drive": "Google Drive",
  "/help": "Help",
};
