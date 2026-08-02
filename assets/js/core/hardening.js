function installSkipLink() {
  if (document.querySelector(".skip-link")) return;
  const main = document.querySelector("main");
  if (!main) return;
  if (!main.id) main.id = "main-content";
  const link = document.createElement("a");
  link.className = "skip-link";
  link.href = `#${main.id}`;
  link.textContent = "Saltar al contenido principal";
  document.body.prepend(link);
}

function installConnectionNotice() {
  const region = document.createElement("div");
  region.className = "connection-notice";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.hidden = navigator.onLine;
  region.textContent = "Sin conexión. Puedes seguir usando las funciones locales disponibles.";
  document.body.append(region);
  window.addEventListener("offline", () => { region.hidden = false; });
  window.addEventListener("online", () => { region.hidden = true; });
}

function showUpdateNotice(registration) {
  if (document.querySelector(".app-update-notice") || !registration.waiting) return;
  const region = document.createElement("div");
  region.className = "connection-notice app-update-notice";
  region.setAttribute("role", "status");
  region.innerHTML = '<span>Hay una versión nueva disponible.</span><button class="button small primary" type="button">Actualizar</button>';
  region.querySelector("button").addEventListener("click", () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
  document.body.append(region);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    registration.update().catch(() => {});
    showUpdateNotice(registration);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateNotice(registration);
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch (error) {
    console.warn("Service worker no disponible.", error);
  }
}

installSkipLink();
installConnectionNotice();
registerServiceWorker();
