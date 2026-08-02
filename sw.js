const CACHE_NAME = "crohnoz-fresh-market-v2";
const OFFLINE_URL = "/offline.html";
const CORE_ASSETS = [
  OFFLINE_URL,
  "/operar.html",
  "/inventario.html",
  "/compras.html",
  "/ventas.html",
  "/asistente.html",
  "/validacion.html",
  "/cierre.html",
  "/cuentas.html",
  "/admin.html",
  "/assets/css/tokens.css",
  "/assets/css/base.css",
  "/assets/css/guided-shell.css",
  "/assets/css/hardening.css",
  "/assets/css/pilot-completion.css",
  "/assets/js/core/config.js",
  "/assets/js/core/storage.js",
  "/assets/js/core/format.js",
  "/assets/js/core/guided-shell.js",
  "/assets/js/core/guided-shell-state.js",
  "/assets/js/core/hardening.js",
  "/assets/js/data/demo-data.js",
  "/assets/js/data/receivables-demo.js",
  "/assets/js/data/operations-demo.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request)) || caches.match(OFFLINE_URL)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
