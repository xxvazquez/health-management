// __BUILD_ID__ is substituted with the deploy's git SHA by
// .github/workflows/deploy.yml right before the build — this is what
// actually differs between deploys and is what triggers the cleanup below.
// The browser detects a new service worker by diffing this file's bytes,
// and self.skipWaiting() + clients.claim() (below) make it take over
// immediately; without this substitution the string here — and therefore
// this whole file — never changes between deploys, so the browser never
// notices a new version shipped, and every hashed /_next/static/ asset
// this cache-first strategy stores just accumulates forever (the `activate`
// cleanup below only ever runs when CACHE_NAME itself changes).
const CACHE_NAME = "lauva-shell-__BUILD_ID__";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/manifest.webmanifest"]))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Hashed build assets never change under a given filename — cache-first.
  if (request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Only cache a real success — caching a transient 4xx/5xx (a bad
            // deploy briefly serving one, a hiccup) would stick as this
            // asset's offline fallback until some later successful fetch
            // happens to overwrite it.
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else (pages, icons, manifest): network-first, falling back to
  // cache so the app shell still loads offline once it's been visited once.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Same reasoning as the cache-first branch above — don't let a
        // failed response become the offline fallback.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});

// Breakfast reminder (the only thing that sends a push right now) — shows
// whatever title/body the breakfast-reminder-cron Edge Function sent.
self.addEventListener("push", (event) => {
  let data = { title: "Lauva", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Malformed/empty payload — fall back to the defaults above.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/log");
    })
  );
});
