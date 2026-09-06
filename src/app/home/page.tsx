"use client";

import { RouteRedirect } from "@/lib/RouteRedirect";

/** The Household page folded into the Notes area — its shared notes, codes
 * and wishlist are tabs there now. Keeps old links, bookmarks, the PWA's
 * saved route and the Android share target working (the query string and
 * hash carry across). */
export default function HouseholdRedirect() {
  return <RouteRedirect to="/personal" />;
}
