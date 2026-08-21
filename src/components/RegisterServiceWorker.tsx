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
      // sw.js calls skipWaiting() + clients.claim() so a new deploy's worker
      // takes over immediately — but "takes over" only means it controls
      // the *next* fetch, not that the already-open tab reloads. Without
      // this listener, an open tab keeps running the old page indefinitely
      // (new deploy's chunk hashes vs. old HTML) until the user manually
      // reloads. `refreshing` guards against the event firing more than
      // once per tab.
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }, []);

  return null;
}
