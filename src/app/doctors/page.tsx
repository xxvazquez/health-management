"use client";

import { RouteRedirect } from "@/lib/RouteRedirect";

/** The Doctors page became "Medical" — this keeps old links, bookmarks and
 * the PWA's saved routes working, hash and all (`/doctors#followups` → the
 * right tab). */
export default function DoctorsRedirect() {
  return <RouteRedirect to="/medical" />;
}
