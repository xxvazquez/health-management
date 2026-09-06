"use client";

import { RouteRedirect } from "@/lib/RouteRedirect";

/** The Overview page became "Agenda" — an urgency-first list of what needs
 * attention. Keeps old links, bookmarks and the PWA's saved route working. */
export default function OverviewRedirect() {
  return <RouteRedirect to="/agenda" />;
}
