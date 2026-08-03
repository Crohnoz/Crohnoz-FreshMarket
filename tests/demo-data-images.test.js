import test from "node:test";
import assert from "node:assert/strict";

import { categories, products } from "../assets/js/data/demo-data.js";

test("todos los productos demo tienen imagen HTTPS y texto alternativo", () => {
  assert.ok(products.length >= 24, "el catálogo inicial debe ofrecer al menos 24 productos");
  products.forEach((product) => {
    assert.match(product.image, /^https:\/\//, `${product.name} debe usar una imagen HTTPS`);
    assert.ok(product.imageAlt?.trim().length >= 12, `${product.name} necesita texto alternativo descriptivo`);
    assert.ok(product.badge?.trim(), `${product.name} necesita una etiqueta comercial`);
  });
});

test("los identificadores e imágenes del catálogo no se duplican", () => {
  assert.equal(new Set(products.map((product) => product.id)).size, products.length);
  assert.equal(new Set(products.map((product) => product.image)).size, products.length);
});

test("el surtido inicial prioriza frutas, verduras y despensa local para Temuco", () => {
  const counts = Object.fromEntries(categories.map((category) => [
    category.id,
    products.filter((product) => product.category === category.id).length,
  ]));

  assert.equal(categories.find((category) => category.id === "all")?.name, "Todos");
  assert.ok(counts.fruits >= 9, "deben existir al menos nueve frutas");
  assert.ok(counts.vegetables >= 10, "deben existir al menos diez verduras");
  assert.ok(counts.local >= 3, "deben existir miel y mermeladas en despensa local");
  assert.ok(products.some((product) => /miel/i.test(product.name)));
  assert.ok(products.filter((product) => /mermelada/i.test(product.name)).length >= 2);
});
