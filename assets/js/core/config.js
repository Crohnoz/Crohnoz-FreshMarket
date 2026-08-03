export const APP_CONFIG = Object.freeze({
  appName: "Crohnoz Fresh Market",
  storageNamespace: "crohnoz-fresh-market",
  version: "0.6.0-pilot",
  demoNotice: "Piloto comercial · verifica si estás en modo local o conectado",
});

export const DEFAULT_BUSINESS = Object.freeze({
  name: "Mercado La Cosecha",
  tagline: "Frutas y verduras frescas, directo a tu mesa",
  whatsapp: "",
  primaryColor: "#2f7d4a",
  accentColor: "#f2b544",
  darkMode: false,
  isOpen: true,
  deliveryFee: 2500,
  tolerancePercent: 5,
  maxExtraAmount: 1500,
});

if (typeof window !== "undefined" && typeof document !== "undefined") {
  Promise.all([
    import("./guided-shell.js").then(() => import("./guided-shell-state.js")),
    import("./connection-shell.js"),
    import("./hardening.js"),
  ]).catch((error) => console.warn("No se pudo montar una mejora progresiva.", error));
}
