const CACHE_NAME = "dj1free-records-v7"; // cambia el número cuando actualices
const ASSETS = [
  "./",
  "index.html",
  "artistas.html",
  "artista.html",
  "album.html",
  "cancion.html",
  "css/style.css",
  "js/app.js",
  "data/catalog.json",
  "manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
