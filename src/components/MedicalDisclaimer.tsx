"use client";

import { usePathname } from "next/navigation";

/** The "not medical advice" line — shown only where the app is actually
 * interpreting data (Overview, Analytics), not on data-entry or utility
 * pages where it's just perpetual noise. Client component so it can read
 * the route. */
const SHOW_ON = ["/overview", "/analytics"];

export function MedicalDisclaimer() {
  const pathname = usePathname();
  const path = pathname.replace(/\/+$/, "") || "/";
  if (!SHOW_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  return (
    <footer className="mt-8 w-full text-center text-xs" style={{ color: "var(--text-muted)" }}>
      Personal data insights, not medical advice.
    </footer>
  );
}
