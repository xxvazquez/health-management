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
      // the *next* fetch, not that the already-open tab reloads. Without a
      // reload, an open tab keeps running the old HTML (whose chunk hashes
      // no longer exist) until the user reloads by hand.
      //
      // Only wire the reload for a genuine UPDATE — i.e. a worker was
      // already in control when this page loaded. On a *first* install the
      // same clients.claim() also fires `controllerchange`, and reloading
      // then is a pointless full-page flash on the very first visit (and
      // every private-window / post-cache-clear visit).
      if (navigator.serviceWorker.controller) {
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      }
    }
  }, []);

  return null;
}
