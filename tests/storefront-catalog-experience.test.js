import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import { categories, products } from "../assets/js/data/demo-data.js";
import {
  CATALOG_PAGE_SIZE,
  categoryProductCounts,
  filterCatalogProducts,
  paginateCatalog,
} from "../assets/js/domain/catalog-experience.js";

test("catalog search is accent-insensitive and recognizes everyday terms", () => {
  assert.equal(filterCatalogProducts(products, { query: "platano" })[0]?.id, "banana");
  assert.equal(filterCatalogProducts(products, { query: "arandano" })[0]?.id, "blueberries");
  assert.ok(filterCatalogProducts(products, { query: "apicola" }).some((product) => product.id === "araucania-honey"));
  assert.ok(filterCatalogProducts(products, { query: "remolacha" }).some((product) => product.id === "beetroot"));
});

test("category counts and catalog pagination expose the expanded assortment progressively", () => {
  const counts = categoryProductCounts(products, categories);
  assert.equal(counts.all, products.length);
  assert.ok(counts.fruits >= 9);
  assert.ok(counts.vegetables >= 10);
  assert.ok(counts.local >= 3);

  const firstPage = paginateCatalog(products, CATALOG_PAGE_SIZE);
  assert.equal(firstPage.visible.length, 12);
  assert.equal(firstPage.remaining, products.length - 12);
  assert.equal(paginateCatalog(products, 24).remaining, 0);
});

test("storefront keeps photographs clean and offers friendlier catalog controls", async () => {
  const [html, app, css, worker] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/js/store/app.js", import.meta.url), "utf8"),
    readFile(new URL("../assets/css/store.css", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /Catálogo demo para Temuco/i);
  assert.match(html, /id="load-more-products"/);
  assert.match(html, /id="clear-catalog-filters"/);
  assert.match(html, /miel y mermeladas/i);
  assert.doesNotMatch(app, /product-emoji-fallback|cart-emoji/);
  assert.match(app, /product-image-fallback/);
  assert.match(app, /categoryProductCounts/);
  assert.match(css, /\.chip small/);
  assert.doesNotMatch(css, /\.product-visual::after/);
  assert.match(worker, /\/assets\/js\/domain\/catalog-experience\.js/);
});

test("new storefront scripts pass syntax validation", () => {
  execFileSync(process.execPath, ["--check", "assets/js/store/app.js"]);
  execFileSync(process.execPath, ["--check", "assets/js/domain/catalog-experience.js"]);
});
