"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    // Skipped in dev: Turbopack's dev chunk URLs aren't content-hashed the
    // way a production build's are, so the service worker's cache-first
    // rule for /_next/static would keep serving pre-restart JS until the
    // cache is cleared by hand — a production-only concern, not a bug to
    // work around at runtime.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  return null;
}
