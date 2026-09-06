/** Canonical display name for each top-level route. Defined once here so
 * the sidebar (Nav), the mobile tab bar (BottomNav) and the bug-report
 * location field all read the same wording and can't drift apart.
 *
 * Most routes keep their old URLs through the restructure and only the
 * display name changes (`/analytics` → "Trends", `/medical` → "Health",
 * `/personal` → "Notes"). Agenda is the exception — it lives at `/agenda`,
 * with `/overview` redirecting. `/home` (Household) and the account-menu
 * utilities keep their names until their step. */
export const NAV_LABEL: Record<string, string> = {
  "/log": "Log",
  "/agenda": "Agenda",
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
