"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side redirect for renamed / merged routes. Static export has no
 * server to issue a real redirect, so a moved route's `page.tsx` becomes
 * just `return <RouteRedirect to="/new" />`. Carries the hash, so
 * `/old#tab` lands on `/new#tab`.
 *
 * Used by `/doctors` today; the restructure adds more (`/overview`,
 * `/personal`, …) as each area moves.
 */
export function RouteRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(to + hash);
  }, [router, to]);
  return null;
}
