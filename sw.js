// Cache de l'application pour qu'elle fonctionne hors ligne.
// Changer VERSION à chaque modification des fichiers pour forcer la mise à jour.
const VERSION = "v6";
const CACHE = "veille-isbn-" + VERSION;
const FICHIERS = [
  "./",
  "index.html",
  "style.css",
  "config.js",
  "services.js",
  "scan.js",
  "app.js",
  "vendor/zxing.min.js",
  "vendor/fonts/atkinson-next.woff2",
  "vendor/fonts/atkinson-mono.woff2",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Seuls les fichiers de l'appli passent par le cache ; la BnF et PMB vont toujours au réseau.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
