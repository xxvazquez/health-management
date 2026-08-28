"use client";

import { usePathname } from "next/navigation";

/** The standing "not medical advice" line under every page — except the
 * ones that have nothing to do with health data: partner Notes, the Drive
 * browser, and the Personal/Home reminder boards. Kept as a client
 * component (rather than inline in the server layout) only so it can read
 * the route and opt those pages out. */
const HIDE_ON = ["/notes", "/my-drive", "/home", "/help"];

export function MedicalDisclaimer() {
  const pathname = usePathname();
  const path = pathname.replace(/\/+$/, "") || "/";
  if (HIDE_ON.includes(path)) return null;

  return (
    <footer className="px-4 pb-6 sm:px-6 lg:px-8">
      <p className="mx-auto w-full max-w-4xl text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Lauva provides personal data insights only. It is not medical advice and does not diagnose or treat medical conditions.
      </p>
    </footer>
  );
}
