/** Canonical display name for each top-level route. Defined once here so
 * the sidebar (Nav), the mobile tab bar (BottomNav) and the bug-report
 * location field all read the same wording and can't drift apart.
 *
 * Most routes keep their old URLs through the restructure and only the
 * display name changes (`/analytics` → "Trends", `/medical` → "Health",
 * `/personal` → "Notes"). Agenda lives at `/agenda` (`/overview`
 * redirects); the Notes area lives at `/personal` and absorbs `/home`
 * (which redirects). Messages (`/notes`) is a primary nav item, shown only
 * when a partner is linked. */
export const NAV_LABEL: Record<string, string> = {
  "/log": "Log",
  "/agenda": "Agenda",
  "/overview": "Agenda",
  "/analytics": "Trends",
  "/medical": "Health",
  "/personal": "Notes",
  "/home": "Notes",
  "/notes": "Messages",
  "/manage": "Settings",
  "/my-drive": "Google Drive",
  "/help": "Help",
};
