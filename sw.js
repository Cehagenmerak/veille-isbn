// Cache de l'application pour qu'elle fonctionne hors ligne.
// Changer VERSION à chaque modification des fichiers pour forcer la mise à jour.
const VERSION = "v3";
const CACHE = "veille-isbn-" + VERSION;
const FICHIERS = [
  "./",
  "index.html",
  "style.css",
  "config.js",
  "app.js",
  "vendor/zxing.min.js",
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
