// Cache de l'application pour qu'elle fonctionne hors ligne.
// Changer VERSION à chaque modification des fichiers pour forcer la mise à jour.
const VERSION = "v8";
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
  // cache: "reload" : on va chercher les fichiers sur le serveur, pas dans le cache du navigateur
  // (GitHub Pages le garde 10 min, ce qui pouvait figer l'ancienne version dans la nouvelle).
  const frais = FICHIERS.map((f) => new Request(f, { cache: "reload" }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(frais)).then(() => self.skipWaiting()));
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
