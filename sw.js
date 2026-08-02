const CACHE_NAME = "crohnoz-fresh-market-v3";
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
  "/configurador.html",
  "/scanner-lab.html",
  "/assets/css/tokens.css",
  "/assets/css/base.css",
  "/assets/css/guided-shell.css",
  "/assets/css/hardening.css",
  "/assets/css/usability-audit.css",
  "/assets/css/pilot-completion.css",
  "/assets/css/operator-home.css",
  "/assets/css/daily-close.css",
  "/assets/js/core/config.js",
  "/assets/js/core/storage.js",
  "/assets/js/core/format.js",
  "/assets/js/core/guided-shell.js",
  "/assets/js/core/guided-shell-state.js",
  "/assets/js/core/hardening.js",
  "/assets/js/data/demo-data.js",
  "/assets/js/data/receivables-demo.js",
  "/assets/js/data/operations-demo.js",
  "/assets/js/operator/home.js",
  "/assets/js/inventory/app.js",
  "/assets/js/purchasing/app.js",
  "/assets/js/sales/app.js",
  "/assets/js/assistant/app.js",
  "/assets/js/assistant/speech.js",
  "/assets/js/validation/app.js",
  "/assets/js/close/app.js",
  "/assets/js/domain/inventory.js",
  "/assets/js/domain/purchasing.js",
  "/assets/js/domain/sales-flow.js",
  "/assets/js/domain/structured-assistance.js",
  "/assets/js/domain/pilot-validation.js",
  "/assets/js/domain/receivables.js",
  "/assets/js/domain/daily-close.js"
];

async function cacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCoreAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function htmlFallbackFor(url) {
  if (url.pathname === "/" || url.pathname === "") return "/operar.html";
  const segment = url.pathname.split("/").filter(Boolean).at(-1);
  if (!segment) return "/operar.html";
  if (segment.endsWith(".html")) return `/${segment}`;
  return `/${segment}.html`;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedRequest = await caches.match(request);
    if (cachedRequest) return cachedRequest;
    const fallback = await caches.match(htmlFallbackFor(new URL(request.url)));
    return fallback || caches.match(OFFLINE_URL);
  }
}

async function staleWhileRevalidate(request, event) {
  const cached = await caches.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});
