import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { products as baseProducts } from "../assets/js/data/demo-data.js";
import { expandedCatalogProducts } from "../assets/js/data/expanded-catalog.js";
import { filterCatalogProducts, paginateCatalog } from "../assets/js/domain/catalog-experience.js";

const completeCatalog = [...baseProducts, ...expandedCatalogProducts];

test("storefront assortment grows to at least 38 unique products", () => {
  assert.ok(completeCatalog.length >= 38);
  assert.equal(new Set(completeCatalog.map((product) => product.id)).size, completeCatalog.length);
  assert.equal(new Set(completeCatalog.map((product) => product.image)).size, completeCatalog.length);
  assert.ok(completeCatalog.filter((product) => product.category === "fruits").length >= 14);
  assert.ok(completeCatalog.filter((product) => product.category === "vegetables").length >= 17);
  assert.ok(completeCatalog.filter((product) => product.category === "local").length >= 5);
  assert.ok(completeCatalog.every((product) => product.image.startsWith("https://")));
  assert.ok(completeCatalog.every((product) => product.imageAlt?.trim()));
});

test("new assortment remains searchable with everyday Chilean terms", () => {
  assert.equal(filterCatalogProducts(completeCatalog, { query: "pina" })[0]?.id, "pineapple");
  assert.equal(filterCatalogProducts(completeCatalog, { query: "morron" })[0]?.id, "red-pepper");
  assert.equal(filterCatalogProducts(completeCatalog, { query: "calabacin" })[0]?.id, "zucchini");
  assert.ok(filterCatalogProducts(completeCatalog, { query: "huevos" }).some((product) => product.id === "free-range-eggs"));
  assert.equal(paginateCatalog(completeCatalog, 12).visible.length, 12);
  assert.equal(paginateCatalog(completeCatalog, 12).remaining, completeCatalog.length - 12);
});

test("store bootstrap and CSS prioritize progressive loading and mobile touch", async () => {
  const [html, entry, css, worker] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/js/store/entry.js", import.meta.url), "utf8"),
    readFile(new URL("../assets/css/store-mobile.css", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /assets\/css\/store-mobile\.css/);
  assert.match(html, /assets\/js\/store\/entry\.js/);
  assert.match(html, /Panel dueño/);
  assert.match(entry, /expandedCatalogProducts/);
  assert.match(entry, /await import\("\.\/app\.js"\)/);
  assert.match(css, /\.product-card \.button[\s\S]*min-height:\s*56px/);
  assert.match(css, /\.search input[\s\S]*min-height:\s*54px/);
  assert.match(css, /\.mobile-cart[\s\S]*min-height:\s*58px/);
  assert.match(worker, /crohnoz-fresh-market-v12/);
  assert.match(worker, /\/assets\/js\/data\/expanded-catalog\.js/);
  assert.match(worker, /\/assets\/js\/store\/entry\.js/);
});

test("new storefront assets pass syntax validation", () => {
  execFileSync(process.execPath, ["--check", "assets/js/data/expanded-catalog.js"]);
  execFileSync(process.execPath, ["--check", "assets/js/store/entry.js"]);
});
