export const APP_CONFIG = Object.freeze({
  appName: "Crohnoz Fresh Market",
  storageNamespace: "crohnoz-fresh-market",
  version: "0.1.0",
  demoNotice: "Piloto comercial · datos ficticios · sin autenticación real",
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
  import("./guided-shell.js");
}
