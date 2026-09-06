"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side redirect for renamed / merged routes. Static export has no
 * server to issue a real redirect, so a moved route's `page.tsx` becomes
 * just `return <RouteRedirect to="/new" />`. Carries the query string and
 * hash, so `/old?url=…#tab` lands on `/new?url=…#tab` (the PWA share target
 * on already-installed clients still points at the old `/home` path).
 *
 * Used by `/doctors`, `/overview` and `/home`.
 */
export function RouteRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    const suffix = typeof window !== "undefined" ? window.location.search + window.location.hash : "";
    router.replace(to + suffix);
  }, [router, to]);
  return null;
}
