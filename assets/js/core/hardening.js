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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker no disponible.", error));
}

installSkipLink();
installConnectionNotice();
registerServiceWorker();
