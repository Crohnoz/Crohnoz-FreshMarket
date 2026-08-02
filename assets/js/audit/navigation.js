import { readStorage, writeStorage } from "../core/storage.js";

const VISITED_PAGES_KEY = "visited-operator-pages-v1";
const LAST_ROUTE_KEY = "last-operator-route";
const PAGE = "auditoria.html";

const visited = readStorage(VISITED_PAGES_KEY, []);
writeStorage(VISITED_PAGES_KEY, [...new Set([...(Array.isArray(visited) ? visited : []), PAGE])]);
writeStorage(LAST_ROUTE_KEY, {
  href: PAGE,
  label: "Auditoría y trazabilidad",
  visitedAt: new Date().toISOString(),
});
