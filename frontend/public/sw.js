const TILE_CACHE = "heat-relief-tiles-v1";
const APP_CACHE = "heat-relief-app-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![TILE_CACHE, APP_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const isRasterTileRequest =
    url.hostname.includes("tile.openstreetmap.org") ||
    url.pathname.includes("/tiles/") ||
    url.pathname.includes("/tile/");

  if (isRasterTileRequest) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  if (request.method === "GET" && (request.destination === "document" || request.destination === "script" || request.destination === "style")) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return (await cache.match(request)) || Response.error();
        }
      })
    );
  }
});
